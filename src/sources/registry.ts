/**
 * Source registry. The only entry point the UI uses to reach music sources.
 * Adapters are registered in `adapters` below (one line each, see docs/sources.md).
 */
import { env } from '@/lib/env';
import { isUnavailable } from '@/store/unavailableStore';
import { archiveSource } from './archive';
import { fmaSource } from './fma';
import { createJamendoSource } from './jamendo';
import { localSource } from './local';
import type { MusicSource, PlaybackSource, SourceId, Track, TrackCollection } from './types';
import { createYouTubeSource } from './youtube';

/**
 * Stream URLs are cached for a while so "next", replays and the prefetched next song start
 * without another API round trip (Jamendo looks every URL up again otherwise).
 */
const URL_CACHED_SOURCES = new Set(['jamendo', 'internetarchive', 'archive', 'fma']);
const URL_CACHE_MS = 20 * 60_000;
const URL_CACHE_MAX = 200;
const SEARCH_CACHE_MS = 10 * 60_000;
const SEARCH_CACHE_MAX = 50;

export { importLocalFiles, localFileToTrack, removeLocalFile } from './local';

export const SOURCE_LABELS: Record<SourceId, string> = {
  jamendo: 'Jamendo',
  archive: 'Internet Archive',
  fma: 'Free Music Archive',
  local: 'On this device',
  youtube: 'YouTube',
};

export const ALL_SOURCE_IDS: readonly SourceId[] = [
  'jamendo',
  'archive',
  'fma',
  'local',
  'youtube',
];

export interface Registry {
  sources: readonly MusicSource[];
  getSource(id: SourceId): MusicSource | undefined;
  /** Search the given sources (all registered ones by default) in parallel and merge results. */
  searchAll(query: string, sourceIds?: readonly SourceId[], limit?: number): Promise<Track[]>;
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
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      const t = list[i];
      if (t) out.push(t);
    }
  }
  return out;
}

export function createRegistry(adapters: readonly MusicSource[]): Registry {
  // Per registry instance (each test gets a fresh one).
  const urlCache = new Map<string, { url: string; at: number }>();
  const inFlight = new Map<string, Promise<string>>();
  const searchCache = new Map<string, { tracks: Track[]; at: number }>();
  const byId = new Map(adapters.map((a) => [a.id, a] as const));

  const self: Registry = {
    sources: adapters,
    getSource: (id) => byId.get(id),

    async searchAll(query, sourceIds, limit = 20) {
      const q = query.trim();
      if (!q) return [];
      const targets = sourceIds
        ? sourceIds.map((id) => byId.get(id)).filter((s): s is MusicSource => !!s)
        : adapters;
      if (targets.length === 0) return [];

      // Same search again (back-space, tab switch, re-open): answer from the cache.
      const key = `${targets.map((t) => t.id).join(',')}|${limit}|${q.toLowerCase()}`;
      const hit = searchCache.get(key);
      if (hit && Date.now() - hit.at < SEARCH_CACHE_MS)
        return hit.tracks.filter((t) => !isUnavailable(t.id));

      const results = await Promise.allSettled(targets.map((s) => s.search(q, limit)));
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      if (ok.length === 0) {
        const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        throw first?.reason instanceof Error ? first.reason : new Error('Search failed');
      }
      const tracks = interleave(ok);
      // Only cache complete answers (a failed source should be retried next time).
      if (ok.length === results.length) {
        searchCache.set(key, { tracks, at: Date.now() });
        if (searchCache.size > SEARCH_CACHE_MAX) {
          const oldest = searchCache.keys().next().value;
          if (oldest !== undefined) searchCache.delete(oldest);
        }
      }
      return tracks.filter((t) => !isUnavailable(t.id));
    },

    async getStreamUrl(track) {
      const source = byId.get(track.source);
      if (!source) throw new Error(`Source "${track.source}" is not available`);
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
      if (!source) throw new Error(`Source "${track.source}" is not available`);
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
 * Registered adapters. Add new sources here. Jamendo needs its client id in .env.
 * YouTube works on-device; an optional SONIQ server in .env is its fallback.
 */
const adapters: MusicSource[] = [
  ...(env.jamendoClientId ? [createJamendoSource(env.jamendoClientId)] : []),
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
export const getStreamUrl = registry.getStreamUrl;
export const getPlaybackSource = registry.getPlaybackSource;
export const prefetch = registry.prefetch;
export const getAlbum = registry.getAlbum;
export const getArtist = registry.getArtist;
