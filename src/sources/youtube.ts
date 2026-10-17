/**
 * YouTube source via the SONIQ backend (server/: Node + yt-dlp). PERSONAL USE ONLY,
 * never ship this in a Play Store build.
 *
 * The app never talks to YouTube directly. Search and audio both go through the server;
 * it proxies the audio because YouTube stream URLs are bound to the IP that resolved them.
 * Playback is a normal https stream in expo-audio, so background play and lock-screen
 * controls work like any other source.
 */
import { TrackUnavailableError } from '@/lib/errors';
import { buildUrl, fetchJson, HttpError } from '@/lib/fetch';
import { useSourceHealthStore } from '@/store/sourceHealthStore';
import type { MusicSource, SourceHealth, Track } from './types';

interface ServerTrack {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  artworkUrl?: string;
}

/** Free hosts (Render) sleep when idle; the first request can take up to a minute. */
const COLD_START_TIMEOUT_MS = 70_000;

/** Human-readable reason for a failed server call. */
function describe(err: unknown): string {
  if (err instanceof HttpError) {
    switch (err.status) {
      case 401:
        return 'SONIQ server rejected the key. Check EXPO_PUBLIC_SONIQ_SERVER_KEY.';
      case 429:
        return 'YouTube is blocking the server (bot check). Add YTDLP_COOKIES or run the server at home.';
      case 502:
      case 504:
        return 'yt-dlp failed on the server. Redeploy it to get the latest yt-dlp.';
      default:
        return `SONIQ server error (HTTP ${err.status}).`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

function reportHealth(health: Omit<SourceHealth, 'checkedAt'>): void {
  useSourceHealthStore.getState().set('youtube', { ...health, checkedAt: Date.now() });
}

/** Server problems (not offline) are recorded so Settings > YouTube shows them. */
function reportFailure(err: unknown): void {
  if (!(err instanceof HttpError)) return;
  reportHealth({
    ok: false,
    stage: `http-${err.status}`,
    message: describe(err),
    details: [err.url.replace(/key=[^&]+/, 'key=***')],
  });
}

function reportWorking(): void {
  const prev = useSourceHealthStore.getState().bySource.youtube;
  if (prev && !prev.ok) reportHealth({ ok: true, message: 'Working', details: [] });
}

export function createYouTubeSource(serverUrl: string, apiKey: string): MusicSource {
  const base = serverUrl.replace(/\/+$/, '');
  const url = (path: string, params: Record<string, string | number | undefined> = {}) =>
    buildUrl(`${base}${path}`, { ...params, key: apiKey || undefined });

  const toTrack = (t: ServerTrack): Track => ({
    id: `youtube:${t.id}`,
    title: t.title,
    artist: t.artist,
    durationSec: t.durationSec,
    artworkUrl: t.artworkUrl,
    source: 'youtube',
  });

  const videoId = (track: Track) => track.id.replace(/^youtube:/, '');

  /** Ask the server to resolve the stream (warms its cache). */
  const resolve = (id: string) =>
    fetchJson<{ id: string }>(url('/resolve', { id }), { timeoutMs: COLD_START_TIMEOUT_MS });

  return {
    id: 'youtube',
    label: 'YouTube',

    async search(query, limit = 20) {
      try {
        const { results } = await fetchJson<{ results: ServerTrack[] }>(
          url('/search', { q: query, limit }),
          { timeoutMs: COLD_START_TIMEOUT_MS },
        );
        reportWorking();
        return (results ?? []).map(toTrack);
      } catch (err) {
        reportFailure(err);
        throw err instanceof HttpError ? new Error(describe(err)) : err;
      }
    },

    async getStreamUrl(track) {
      const id = videoId(track);
      try {
        await resolve(id);
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) {
          throw new TrackUnavailableError('This YouTube video is not available');
        }
        reportFailure(err);
        throw err instanceof HttpError ? new Error(describe(err)) : err;
      }
      reportWorking();
      // expo-audio can't send headers per request here, so the key goes in the query.
      return url('/stream', { id });
    },

    async prefetch(track) {
      try {
        await resolve(videoId(track));
      } catch {
        // Best effort: real playback reports errors.
      }
    },

    async checkHealth() {
      const steps: string[] = [];
      try {
        const h = await fetchJson<{ ok: boolean; ytdlp?: string }>(`${base}/health`, {
          timeoutMs: COLD_START_TIMEOUT_MS,
        });
        steps.push(`Server: OK (yt-dlp ${h.ytdlp ?? '?'})`);
        const { results } = await fetchJson<{ results: ServerTrack[] }>(
          url('/search', { q: 'arijit singh', limit: 3 }),
          { timeoutMs: COLD_START_TIMEOUT_MS },
        );
        steps.push(`Search: OK (${results.length} results)`);
        const first = results[0];
        if (first) {
          await resolve(first.id);
          steps.push('Stream: OK');
        }
        const health: SourceHealth = { ok: true, message: 'Working', details: steps, checkedAt: Date.now() };
        useSourceHealthStore.getState().set('youtube', health);
        return health;
      } catch (err) {
        const health: SourceHealth = {
          ok: false,
          stage: err instanceof HttpError ? `http-${err.status}` : 'network',
          message: describe(err),
          details: steps,
          fix: 'Check that the server is deployed and EXPO_PUBLIC_SONIQ_SERVER_URL / _KEY in .env match it.',
          checkedAt: Date.now(),
        };
        if (err instanceof HttpError) useSourceHealthStore.getState().set('youtube', health);
        return health;
      }
    },
  };
}
