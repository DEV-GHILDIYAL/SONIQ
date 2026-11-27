/**
 * Source registry. The only entry point the UI uses to reach music sources.
 * Adapters are registered in `adapters` below (one line each, see docs/sources.md).
 */
import { env } from '@/lib/env';
import { TrackUnavailableError } from '@/lib/errors';
import { useSearchCacheStore } from '@/store/searchCacheStore';
import { isUnavailable } from '@/store/unavailableStore';
import { archiveSource } from './archive';
import { fmaSource } from './fma';
import { localSource } from './local';
import type { MusicSource, PlaybackSource, SourceId, Track, TrackCollection } from './types';
import { createYouTubeSource } from './youtube';

/**
 * Stream URLs are cached for a while so "next", replays and the prefetched next song start
 * without another API round trip.
 */
const URL_CACHED_SOURCES = new Set(['internetarchive', 'archive', 'fma']);
const URL_CACHE_MS = 20 * 60_000;
const URL_CACHE_MAX = 200;
const SEARCH_CACHE_MS = 10 * 60_000;
const SEARCH_CACHE_MAX = 50;

export { importLocalFiles, localFileToTrack, removeLocalFile } from './local';

export const SOURCE_LABELS: Record<SourceId, string> = {
  // Removed source; kept so songs saved from it still show a label.
  jamendo: 'Jamendo',
  archive: 'Internet Archive',
  fma: 'Free Music Archive',
  local: 'On this device',
  youtube: 'YouTube',
};

export const ALL_SOURCE_IDS: readonly SourceId[] = ['archive', 'fma', 'local', 'youtube'];

export interface SearchBatch {
  tracks: Track[];
  replace?: boolean;
}

export function searchCacheKey(query: string, sourceIds?: readonly SourceId[], limit = 20): string {
  const ids = (sourceIds ? [...sourceIds] : [...ALL_SOURCE_IDS]).join(',');
  return `${ids}|${limit}|${query.trim().toLowerCase()}`;
}

export interface Registry {
  sources: readonly MusicSource[];
  getSource(id: SourceId): MusicSource | undefined;
  /** Search the given sources (all registered ones by default) in parallel and merge results. */
  searchAll(query: string, sourceIds?: readonly SourceId[], limit?: number): Promise<Track[]>;
  /** Same search, but each source's tracks are emitted as soon as that source answers. */
  searchAllWithBatches(
    query: string,
    sourceIds: readonly SourceId[] | undefined,
    limit: number | undefined,
    onBatch: (batch: SearchBatch) => void,
    signal?: AbortSignal,
  ): Promise<Track[]>;
  getStreamUrl(track: Track): Promise<string>;
  /**
   * What the player should load. Sources with `getPlaybackSource` can stream directly;
   * `preferDownload` asks for a local file (used when a direct stream failed).
   */
  getPlaybackSource(track: Track, options?: { preferDownload?: boolean }): Promise<PlaybackSource>;
  /** Warm up a track that is about to play (no-op for sources without prefetch). */
  prefetch(track: Track): Promise<void>;
  /** Album / artist pages. `key` = "<source>:<id>" (see albumKey / artistKey). */
  getAlbum(key: string): Promise<TrackCollection>;
  getArtist(key: string): Promise<TrackCollection>;
}

/** "<source>:<albumId>" route key for a track's album, or undefined if the source has no albums. */
export function albumKey(track: Track): string | undefined {
  return track.albumId ? `${track.source}:${track.albumId}` : undefined;
}

/** "<source>:<artistId>" route key for a track's artist. */
export function artistKey(track: Track): string | undefined {
  return track.artistId ? `${track.source}:${track.artistId}` : undefined;
}

function splitKey(key: string): [SourceId, string] {
  const i = key.indexOf(':');
  return [key.slice(0, i) as SourceId, key.slice(i + 1)];
}

/** Interleave lists so the top results of every source show up first. */
function interleave(lists: readonly Track[][]): Track[] {
  const out: Track[] = [];
  const seen = new Set<string>();
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      const t = list[i];
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
  }
  return out;
}

export function createRegistry(adapters: readonly MusicSource[]): Registry {
  // Per registry instance (each test gets a fresh one).
  const urlCache = new Map<string, { url: string; at: number }>();
  const inFlight = new Map<string, Promise<string>>();
  const searchCache = new Map<string, { tracks: Track[]; at: number }>();
  const searchInFlight = new Map<string, Promise<Track[]>>();
  const byId = new Map(adapters.map((a) => [a.id, a] as const));

  const self: Registry = {
    sources: adapters,
    getSource: (id) => byId.get(id),

    async searchAll(query, sourceIds, limit = 20) {
      return self.searchAllWithBatches(query, sourceIds, limit, () => {});
    },

    async searchAllWithBatches(query, sourceIds, limit = 20, onBatch = () => {}, signal) {
      const q = query.trim();
      if (!q) return [];
      const targets = sourceIds
        ? sourceIds.map((id) => byId.get(id)).filter((s): s is MusicSource => !!s)
        : adapters;
      if (targets.length === 0) return [];
      const key = searchCacheKey(
        q,
        targets.map((t) => t.id),
        limit,
      );
      const visible = (t: Track) => !isUnavailable(t.id);

      const hit = searchCache.get(key);
      if (hit && Date.now() - hit.at < SEARCH_CACHE_MS) {
        const tracks = hit.tracks.filter(visible);
        onBatch({ tracks, replace: true });
        return tracks;
      }
      const saved = useSearchCacheStore.getState().getSaved(key);
      if (saved && saved.length > 0) onBatch({ tracks: saved.filter(visible), replace: true });
      const pending = searchInFlight.get(key);
      if (pending) {
        const tracks = (await pending).filter(visible);
        onBatch({ tracks, replace: true });
        return tracks;
      }

      const job = (async () => {
        const lists: Track[][] = targets.map(() => []);
        const emitted = new Set<string>();
        const failures: unknown[] = [];
        let batches = 0;
        const emit = () => {
          const fresh = interleave(lists).filter((t) => visible(t) && !emitted.has(t.id));
          if (fresh.length === 0 && batches === 0) return;
          for (const t of fresh) emitted.add(t.id);
          onBatch({ tracks: fresh, replace: batches === 0 });
          batches += 1;
        };

        await Promise.all(
          targets.map(async (source, i) => {
            try {
              const tracks = await source.search(q, limit, signal);
              if (signal?.aborted) return;
              lists[i] = tracks;
              emit();
            } catch (err) {
              failures.push(err);
            }
          }),
        );
        if (signal?.aborted) throw new Error('Search aborted');
        if (failures.length === targets.length) {
          const first = failures[0];
          throw first instanceof Error ? first : new Error('Search failed');
        }
        const tracks = interleave(lists).filter(visible);
        if (batches === 0) onBatch({ tracks, replace: true });
        if (failures.length === 0) {
          searchCache.set(key, { tracks, at: Date.now() });
          if (searchCache.size > SEARCH_CACHE_MAX) {
            const oldest = searchCache.keys().next().value;
            if (oldest !== undefined) searchCache.delete(oldest);
          }
          useSearchCacheStore.getState().save(key, tracks);
        }
        return tracks;
      })().finally(() => searchInFlight.delete(key));
      searchInFlight.set(key, job);
      return job;
    },

    async getStreamUrl(track) {
      const source = byId.get(track.source);
      if (!source) throw new TrackUnavailableError(`Source "${track.source}" is not available`);
      if (!URL_CACHED_SOURCES.has(track.source)) return source.getStreamUrl(track);
      const hit = urlCache.get(track.id);
      if (hit && Date.now() - hit.at < URL_CACHE_MS) return hit.url;
      const pending = inFlight.get(track.id);
      if (pending) return pending;
      const run = source
        .getStreamUrl(track)
        .then((url) => {
          urlCache.set(track.id, { url, at: Date.now() });
          if (urlCache.size > URL_CACHE_MAX) {
            const oldest = urlCache.keys().next().value;
            if (oldest !== undefined) urlCache.delete(oldest);
          }
          return url;
        })
        .finally(() => inFlight.delete(track.id));
      inFlight.set(track.id, run);
      return run;
    },

    async getPlaybackSource(track, options) {
      const source = byId.get(track.source);
      if (!source) throw new TrackUnavailableError(`Source "${track.source}" is not available`);
      if (!options?.preferDownload && source.getPlaybackSource)
        return source.getPlaybackSource(track);
      return { uri: await self.getStreamUrl(track) };
    },

    async prefetch(track) {
      const source = byId.get(track.source);
      if (source?.prefetch) {
        await source.prefetch(track);
        return;
      }
      // No source-specific warm-up: at least have the stream URL ready.
      if (URL_CACHED_SOURCES.has(track.source)) await self.getStreamUrl(track);
    },

    async getAlbum(key) {
      const [id, albumId] = splitKey(key);
      const source = byId.get(id);
      if (!source?.getAlbum) throw new Error('Albums are not available for this source');
      const album = await source.getAlbum(albumId);
      return { ...album, tracks: album.tracks.filter((t) => !isUnavailable(t.id)) };
    },

    async getArtist(key) {
      const [id, artistId] = splitKey(key);
      const source = byId.get(id);
      if (!source?.getArtist) throw new Error('Artist pages are not available for this source');
      const artist = await source.getArtist(artistId);
      return { ...artist, tracks: artist.tracks.filter((t) => !isUnavailable(t.id)) };
    },
  };
  return self;
}

/**
 * Registered adapters. Add new sources here.
 * YouTube works on-device; an optional SONIQ server in .env is its fallback.
 */
const adapters: MusicSource[] = [
  archiveSource,
  fmaSource,
  localSource,
  // On-device by default; the SONIQ server (if set in .env) is only a fallback.
  createYouTubeSource({ serverUrl: env.soniqServerUrl, serverKey: env.soniqServerKey }),
];

const registry = createRegistry(adapters);

export const sources = registry.sources;
export const getSource = registry.getSource;
export const searchAll = registry.searchAll;
export const searchAllWithBatches = registry.searchAllWithBatches;
export const getStreamUrl = registry.getStreamUrl;
export const getPlaybackSource = registry.getPlaybackSource;
export const prefetch = registry.prefetch;
export const getAlbum = registry.getAlbum;
export const getArtist = registry.getArtist;
