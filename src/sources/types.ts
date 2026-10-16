/**
 * Shared contract for every music source adapter.
 * See docs/sources.md before changing anything here.
 */

/** Identifier of a music source. Add new sources to this union. */
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

/** A group of tracks shown on the Album / Artist pages. */
export interface TrackCollection {
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  tracks: Track[];
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
  /** Optional: all tracks of an album (albumId from Track.albumId). */
  getAlbum?(albumId: string): Promise<TrackCollection>;
  /** Optional: tracks by an artist (artistId from Track.artistId). */
  getArtist?(artistId: string): Promise<TrackCollection>;
}
