/**
 * YouTube source — fully free + direct (no own backend, no API key)
 * Uses public Invidious instances.
 */
import { TrackUnavailableError } from '@/lib/errors';
import type { MusicSource, Track } from './types';

// Public Invidious instances (agar ek down ho to doosra try karega)
const INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://yt.artemislena.eu',
  'https://invidious.projectsegfau.lt',
  'https://inv.nadeko.net',
];

interface InvidiousSearchItem {
  type: string;
  videoId: string;
  title: string;
  author: string;
  lengthSeconds: number;
  videoThumbnails?: { quality: string; url: string }[];
}

function getThumbnail(item: InvidiousSearchItem): string | undefined {
  const thumbs = item.videoThumbnails || [];
  return thumbs.find(t => t.quality === 'medium')?.url || thumbs[0]?.url;
}

function toTrack(item: InvidiousSearchItem): Track {
  return {
    id: `youtube:${item.videoId}`,
    title: item.title,
    artist: item.author || 'YouTube',
    durationSec: item.lengthSeconds || 0,
    artworkUrl: getThumbnail(item),
    source: 'youtube',
  };
}

async function fetchFromInstances<T>(path: string): Promise<T> {
  let lastError: any = null;

  for (const base of INSTANCES) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) continue;
      return await res.json() as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All Invidious instances failed');
}

export const youtubeSource: MusicSource = {
  id: 'youtube',
  label: 'YouTube',

  async search(query, limit = 20) {
    const data = await fetchFromInstances<InvidiousSearchItem[]>(
      `/api/v1/search?q=${encodeURIComponent(query)}&type=video`
    );

    return (data || [])
      .filter(item => item.type === 'video' && item.videoId)
      .slice(0, limit)
      .map(toTrack);
  },

  async getStreamUrl(track) {
    const videoId = track.id.replace(/^youtube:/, '');

    const data = await fetchFromInstances<{
      adaptiveFormats?: { url: string; type: string; bitrate?: string }[];
      formatStreams?: { url: string; type: string }[];
    }>(`/api/v1/videos/${videoId}`);

    // Pehle audio-only adaptive format dhundho
    const audio = (data.adaptiveFormats || []).find(f =>
      f.type?.startsWith('audio/')
    );

    if (audio?.url) return audio.url;

    // Fallback: mixed format
    const mixed = (data.formatStreams || []).find(f => f.url);
    if (mixed?.url) return mixed.url;

    throw new TrackUnavailableError('No playable stream found');
  },
};