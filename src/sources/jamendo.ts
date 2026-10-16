/**
 * Jamendo (https://developer.jamendo.com/v3.0). Creative Commons music, free client_id.
 * Key comes from EXPO_PUBLIC_JAMENDO_CLIENT_ID; the source is only registered when it is set.
 */
import { TrackUnavailableError } from '@/lib/errors';
import { buildUrl, fetchJson } from '@/lib/fetch';
import type { MusicSource, Track, TrackCollection } from './types';

const BASE = 'https://api.jamendo.com/v3.0';
const API = `${BASE}/tracks/`;

interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_name: string;
  album_name?: string;
  image?: string;
  album_image?: string;
  audio?: string;
  album_id?: string;
  artist_id?: string;
}

interface JamendoResponse<T = JamendoTrack> {
  headers: { status: string; code: number; error_message?: string };
  results: T[];
}

interface JamendoAlbum {
  id: string;
  name: string;
  artist_id: string;
  artist_name: string;
  image?: string;
  tracks: JamendoTrack[];
}

interface JamendoArtist {
  id: string;
  name: string;
  image?: string;
  tracks: JamendoTrack[];
}

function toTrack(t: JamendoTrack): Track {
  return {
    id: `jamendo:${t.id}`,
    title: t.name,
    artist: t.artist_name || 'Unknown artist',
    album: t.album_name || undefined,
    durationSec: Number(t.duration) || 0,
    artworkUrl: t.image || t.album_image || undefined,
    source: 'jamendo',
    albumId: t.album_id ? String(t.album_id) : undefined,
    artistId: t.artist_id ? String(t.artist_id) : undefined,
    streamUrlHint: t.audio || undefined,
  };
}

async function request<T = JamendoTrack>(
  params: Record<string, string | number | undefined>,
  clientId: string,
  url = API,
): Promise<T[]> {
  const data = await fetchJson<JamendoResponse<T>>(
    buildUrl(url, { client_id: clientId, format: 'json', audioformat: 'mp32', ...params }),
  );
  if (data.headers?.status !== 'success') {
    throw new Error(`Jamendo: ${data.headers?.error_message || 'request failed'}`);
  }
  return data.results ?? [];
}

export function createJamendoSource(clientId: string): MusicSource {
  return {
    id: 'jamendo',
    label: 'Jamendo',

    async search(query, limit = 20) {
      const results = await request(
        // No `boost`: it sometimes makes Jamendo return an empty result set.
        { search: query, limit: Math.min(limit, 50), imagesize: 300 },
        clientId,
      );
      return results.filter((t) => t.audio).map(toTrack);
    },

    // Resolved at play time (URLs can expire). Jamendo's id lookup misses some tracks
    // that search returns, so fall back to the URL we saw in the listing.
    async getStreamUrl(track) {
      const id = track.id.replace(/^jamendo:/, '');
      let fresh: string | undefined;
      try {
        const results = await request({ id }, clientId);
        fresh = results.find((r) => String(r.id) === id)?.audio || undefined;
      } catch (err) {
        if (!track.streamUrlHint) throw err;
      }
      const url = fresh ?? track.streamUrlHint;
      if (!url)
        throw new TrackUnavailableError('This Jamendo track is not available for streaming');
      return url;
    },

    async getAlbum(albumId): Promise<TrackCollection> {
      const [album] = await request<JamendoAlbum>(
        { id: albumId, imagesize: 300 },
        clientId,
        `${BASE}/albums/tracks/`,
      );
      if (!album) throw new Error('Album not found');
      return {
        title: album.name,
        subtitle: album.artist_name,
        artworkUrl: album.image,
        tracks: album.tracks
          .filter((t) => t.audio)
          .map((t) =>
            toTrack({
              ...t,
              artist_name: album.artist_name,
              album_name: album.name,
              image: t.image || album.image,
              album_id: album.id,
              artist_id: album.artist_id,
            }),
          ),
      };
    },

    async getArtist(artistId): Promise<TrackCollection> {
      const [artist] = await request<JamendoArtist>(
        { id: artistId, imagesize: 300, limit: 50 },
        clientId,
        `${BASE}/artists/tracks/`,
      );
      if (!artist) throw new Error('Artist not found');
      return {
        title: artist.name,
        subtitle: 'Artist',
        artworkUrl: artist.image,
        tracks: artist.tracks
          .filter((t) => t.audio)
          .map((t) => toTrack({ ...t, artist_name: artist.name, artist_id: artist.id })),
      };
    },
  };
}
