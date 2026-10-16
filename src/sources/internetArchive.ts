/**
 * Internet Archive helpers shared by the `archive` (netlabels) and `fma` (FMA mirror) sources.
 * Search -> item identifiers; item metadata -> first MP3 file -> Track.
 * Track id format: "<source>:<identifier>/<file name>".
 */
import { TrackUnavailableError } from '@/lib/errors';
import { buildUrl, fetchJson } from '@/lib/fetch';
import type { MusicSource, SourceId, Track, TrackCollection } from './types';

const SEARCH_API = 'https://archive.org/advancedsearch.php';
const METADATA_API = 'https://archive.org/metadata/';
const DOWNLOAD = 'https://archive.org/download/';

/** Max items whose metadata we load per search (one extra request each). */
const MAX_ITEMS = 12;

interface SearchResponse {
  response: { docs: { identifier: string }[] };
}

interface IaFile {
  name: string;
  format?: string;
  length?: string;
  title?: string;
  creator?: string;
  artist?: string;
  album?: string;
  track?: string;
}

interface MetadataResponse {
  metadata?: { title?: string | string[]; creator?: string | string[] };
  files?: IaFile[];
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** "234.5" or "3:54" or "1:02:03" -> seconds. */
export function parseLength(length: string | undefined): number {
  if (!length) return 0;
  if (length.includes(':')) {
    return length.split(':').reduce((acc, part) => acc * 60 + (Number(part) || 0), 0);
  }
  return Math.round(Number(length) || 0);
}

/** Strip Lucene syntax so user input can't break the query. */
export function sanitizeQuery(q: string): string {
  return q
    .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isMp3 = (f: IaFile) => /mp3/i.test(f.format ?? '') || /\.mp3$/i.test(f.name);

function stripExt(name: string) {
  const base = name.split('/').pop() ?? name;
  return base.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
}

function fileToTrack(
  source: SourceId,
  identifier: string,
  meta: MetadataResponse,
  file: IaFile,
): Track {
  const itemTitle = first(meta.metadata?.title);
  const title = file.title || stripExt(file.name);
  const artist = file.creator || file.artist || first(meta.metadata?.creator) || 'Unknown artist';
  return {
    id: `${source}:${identifier}/${file.name}`,
    title,
    artist,
    album: file.album || (itemTitle && itemTitle !== title ? itemTitle : undefined),
    durationSec: parseLength(file.length),
    artworkUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    source,
    albumId: identifier,
    artistId: artist !== 'Unknown artist' ? artist : undefined,
  };
}

/** First playable file of an item (one row per item in search results). */
export function itemToTrack(
  source: SourceId,
  identifier: string,
  meta: MetadataResponse,
): Track | null {
  const file = meta.files?.find(isMp3);
  if (!file) return null;
  const track = fileToTrack(source, identifier, meta, file);
  if (file.title) return track;
  // No per-file title: show the item (album) title instead of the file name.
  const itemTitle = first(meta.metadata?.title);
  return itemTitle ? { ...track, title: itemTitle, album: file.album || undefined } : track;
}

/** All MP3 files of an item, in track order. */
export function itemToTracks(
  source: SourceId,
  identifier: string,
  meta: MetadataResponse,
): Track[] {
  const files = (meta.files ?? []).filter(isMp3);
  const num = (f: IaFile) => Number.parseInt(f.track ?? '', 10) || 0;
  files.sort((a, b) => num(a) - num(b) || a.name.localeCompare(b.name));
  return files.map((f) => fileToTrack(source, identifier, meta, f));
}

export function streamUrlFor(track: Track): string {
  const rest = track.id.slice(track.id.indexOf(':') + 1);
  const slash = rest.indexOf('/');
  if (slash <= 0) throw new TrackUnavailableError('Invalid Internet Archive track id');
  const identifier = rest.slice(0, slash);
  const file = rest.slice(slash + 1);
  return `${DOWNLOAD}${encodeURIComponent(identifier)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

export function createInternetArchiveSource(opts: {
  id: SourceId;
  label: string;
  /** Lucene filter appended to every query, e.g. `collection:netlabels`. */
  filter: string;
}): MusicSource {
  return {
    id: opts.id,
    label: opts.label,

    async search(query, limit = 20) {
      const q = sanitizeQuery(query);
      if (!q) return [];
      const search = await fetchJson<SearchResponse>(
        buildUrl(SEARCH_API, {
          q: `(${q}) AND mediatype:audio AND ${opts.filter} AND format:"VBR MP3"`,
          'fl[]': 'identifier',
          'sort[]': 'downloads desc',
          rows: Math.min(limit, MAX_ITEMS),
          output: 'json',
        }),
      );
      const ids = search.response?.docs?.map((d) => d.identifier) ?? [];
      const metas = await Promise.allSettled(
        ids.map((id) => fetchJson<MetadataResponse>(METADATA_API + encodeURIComponent(id))),
      );
      return metas.flatMap((m, i) => {
        const id = ids[i];
        if (m.status !== 'fulfilled' || !id) return [];
        const track = itemToTrack(opts.id, id, m.value);
        return track ? [track] : [];
      });
    },

    // Download URLs are stable; nothing to resolve over the network.
    async getStreamUrl(track) {
      return streamUrlFor(track);
    },

    // IA item = album.
    async getAlbum(identifier): Promise<TrackCollection> {
      const meta = await fetchJson<MetadataResponse>(METADATA_API + encodeURIComponent(identifier));
      const tracks = itemToTracks(opts.id, identifier, meta);
      return {
        title: first(meta.metadata?.title) || identifier,
        subtitle: first(meta.metadata?.creator),
        artworkUrl: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
        tracks,
      };
    },

    // IA has no artist ids: search items by creator name in the same collection.
    async getArtist(name): Promise<TrackCollection> {
      const creator = sanitizeQuery(name);
      const search = await fetchJson<SearchResponse>(
        buildUrl(SEARCH_API, {
          q: `creator:(${creator}) AND mediatype:audio AND ${opts.filter} AND format:"VBR MP3"`,
          'fl[]': 'identifier',
          'sort[]': 'downloads desc',
          rows: MAX_ITEMS,
          output: 'json',
        }),
      );
      const ids = search.response?.docs?.map((d) => d.identifier) ?? [];
      const metas = await Promise.allSettled(
        ids.map((id) => fetchJson<MetadataResponse>(METADATA_API + encodeURIComponent(id))),
      );
      const tracks = metas.flatMap((m, i) => {
        const id = ids[i];
        if (m.status !== 'fulfilled' || !id) return [];
        return itemToTracks(opts.id, id, m.value).slice(0, 5);
      });
      return { title: name, subtitle: 'Artist', tracks };
    },
  };
}
