/**
 * Shared contract for every music source adapter.
 * See docs/sources.md before changing anything here.
 */

/** Identifier of a music source. Add new sources to this union. */
/** 'jamendo' was removed; it stays in the type so old saved songs still load. */
export type SourceId = 'jamendo' | 'archive' | 'fma' | 'local' | 'youtube';

/** A playable track, normalized across all sources. */
export interface Track {
  /** Globally unique id in "<source>:<originalId>" format. */
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  artworkUrl?: string;
  source: SourceId;
  /** Source-specific album id (for the Album page). */
  albumId?: string;
  /** Source-specific artist id (for the Artist page). */
  artistId?: string;
  /**
   * Stream URL seen when the track was listed. Only a fallback: adapters should
   * resolve a fresh URL in getStreamUrl and use this when that lookup fails.
   */
  streamUrlHint?: string;
}

/**
 * What the player needs to start a track. `headers` are sent with every request,
 * so a source can stream directly (YouTube needs its VISIONOS User-Agent).
 */
export interface PlaybackSource {
  /** https URL or a local file:// URI. */
  uri: string;
  /** Extra HTTP headers (User-Agent, ...). Ignored for file:// URIs. */
  headers?: Record<string, string>;
  /**
   * The URI is a direct stream; if it fails the engine may ask again and the source
   * should return a downloaded file (e.g. YouTube's expired googlevideo URL).
   */
  canDownloadFallback?: boolean;
}

/** A group of tracks shown on the Album / Artist pages. */
export interface TrackCollection {
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  tracks: Track[];
}

/** Result of a source self-test or of a real failure (shown in Settings). */
export interface SourceHealth {
  ok: boolean;
  /** Source-specific stage where it broke, when !ok. */
  stage?: string;
  /** One-line human summary. */
  message: string;
  /** Step-by-step log for debugging. */
  details: string[];
  /** What to do about it. */
  fix?: string;
  checkedAt: number;
}

/** Adapter contract implemented by every source in src/sources/. */
export interface MusicSource {
  id: SourceId;
  /** Human-readable name shown in the UI. */
  label: string;
  /** Search tracks. Resolves to an empty array when nothing matches, never undefined. Throws on errors. */
  search(query: string, limit?: number): Promise<Track[]>;
  /** Resolve a playable URL (https or file://). Called at play time; do not cache, URLs may expire. */
  getStreamUrl(track: Track): Promise<string>;
  /**
   * Optional richer resolver for the player: may return a direct stream URL + headers so
   * playback starts on the first buffered chunk instead of after a full download.
   * When absent the player uses getStreamUrl().
   */
  getPlaybackSource?(track: Track): Promise<PlaybackSource>;
  /** Optional: all tracks of an album (albumId from Track.albumId). */
  getAlbum?(albumId: string): Promise<TrackCollection>;
  /** Optional: tracks by an artist (artistId from Track.artistId). */
  getArtist?(artistId: string): Promise<TrackCollection>;
  /** Optional: self-test used by Settings. Never throws. */
  checkHealth?(): Promise<SourceHealth>;
  /** Optional: warm up a track before it plays (e.g. download it). Never throws. */
  prefetch?(track: Track): Promise<void>;
}
