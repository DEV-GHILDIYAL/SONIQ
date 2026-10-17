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
import type { MusicSource, SourceId, Track, TrackCollection } from './types';
import { createYouTubeSource } from './youtube';

export { importLocalFiles, localFileToTrack } from './local';

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
  const byId = new Map(adapters.map((a) => [a.id, a] as const));

  return {
    sources: adapters,
    getSource: (id) => byId.get(id),

    async searchAll(query, sourceIds, limit = 20) {
      const q = query.trim();
      if (!q) return [];
      const targets = sourceIds
        ? sourceIds.map((id) => byId.get(id)).filter((s): s is MusicSource => !!s)
        : adapters;
      if (targets.length === 0) return [];

      const results = await Promise.allSettled(targets.map((s) => s.search(q, limit)));
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      if (ok.length === 0) {
        const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        throw first?.reason instanceof Error ? first.reason : new Error('Search failed');
      }
      return interleave(ok).filter((t) => !isUnavailable(t.id));
    },

    async getStreamUrl(track) {
      const source = byId.get(track.source);
      if (!source) throw new Error(`Source "${track.source}" is not available`);
      return source.getStreamUrl(track);
    },

    async prefetch(track) {
      await byId.get(track.source)?.prefetch?.(track);
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
export const prefetch = registry.prefetch;
export const getAlbum = registry.getAlbum;
export const getArtist = registry.getArtist;
