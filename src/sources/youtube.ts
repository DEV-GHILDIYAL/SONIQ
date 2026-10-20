/**
 * YouTube source. PERSONAL USE ONLY, never ship this in a Play Store build.
 *
 * Playback (default, no download): youtubei.js with the VISIONOS client returns a direct
 * googlevideo URL for the audio track. The player streams it with the client's User-Agent
 * and the patched native player asks for `Range: bytes=0-` on the first request (YouTube
 * throttles an un-ranged GET). Even a 1-hour video starts on the first buffered chunk
 * instead of after a full download; nothing is written to disk for normal playback.
 *
 * Download path (Save to phone, or when the direct stream is refused): the same VISIONOS
 * URL is downloaded with Range requests into the cache and played as a local file, so
 * replays work offline.
 *
 * Fallback: the SONIQ server (server/, Node + yt-dlp) when EXPO_PUBLIC_SONIQ_SERVER_URL is set.
 */
import { Platform } from 'react-native';
import type { Innertube } from 'youtubei.js';

import { TrackUnavailableError } from '@/lib/errors';
import { buildUrl, fetchJson, HttpError } from '@/lib/fetch';
import { FileKvCache } from '@/lib/fileKvCache';
import { downloadMedia, getCachedMedia, MediaDownloadError } from '@/lib/mediaCache';
import { useSourceHealthStore } from '@/store/sourceHealthStore';
import type { MusicSource, PlaybackSource, SourceHealth, Track } from './types';

type YouTubeModule = typeof import('youtubei.js');

const CLIENT = 'VISIONOS' as const;
const CACHE_FOLDER = 'youtube';
/** Free hosts sleep when idle; the first server request can take up to a minute. */
const SERVER_TIMEOUT_MS = 70_000;
/** Direct URLs are reused by prefetch -> play. YouTube usually gives them ~6 h. */
const URL_TTL_MS = 10 * 60_000;
const URL_CACHE_MAX = 50;

export interface YouTubeConfig {
  /** Optional SONIQ server used when on-device fails. */
  serverUrl?: string;
  serverKey?: string;
}

const log = (...args: unknown[]) => {
  if (__DEV__) console.log('[youtube]', ...args);
};

const errText = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

// ---- Health (Settings > YouTube) ----

function saveHealth(health: SourceHealth): void {
  useSourceHealthStore.getState().set('youtube', health);
}

function reportFailure(stage: string, message: string, details: string[] = []): void {
  saveHealth({ ok: false, stage, message, details, checkedAt: Date.now() });
  console.warn(`[youtube] ${stage}: ${message}${details.length ? `\n  ${details.join('\n  ')}` : ''}`);
}

function reportWorking(): void {
  const prev = useSourceHealthStore.getState().bySource.youtube;
  if (prev && !prev.ok) saveHealth({ ok: true, message: 'Working', details: [], checkedAt: Date.now() });
}

// ---- On-device: youtubei.js ----

let ytModule: YouTubeModule | null = null;
let sessionPromise: Promise<Innertube> | null = null;

function loadModule(): YouTubeModule {
  // Lazy require keeps app start fast and lets tests mock the library.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ytModule ??= require('youtubei.js') as YouTubeModule;
  return ytModule;
}

function getSession(): Promise<Innertube> {
  sessionPromise ??= (async () => {
    const started = Date.now();
    const { Innertube: Client } = loadModule();
    // No player script needed: VISIONOS URLs are not ciphered. Makes startup fast.
    const yt = await Client.create({
      location: 'IN',
      retrieve_player: false,
      cache: new FileKvCache('youtubei-cache'),
    });
    log(`session ready in ${Date.now() - started} ms`);
    return yt;
  })().catch((err: unknown) => {
    sessionPromise = null;
    throw err;
  });
  return sessionPromise;
}

/** Duck-typed view of search result nodes (Video, CompactVideo, ...). */
interface VideoNodeLike {
  video_id?: string;
  title?: { toString(): string };
  author?: { name?: string };
  duration?: { seconds?: number };
  best_thumbnail?: { url?: string };
  thumbnails?: { url?: string }[];
}

function nodeToTrack(node: unknown): Track | null {
  const v = node as VideoNodeLike;
  const title = v.title?.toString().trim();
  if (!v.video_id || !title) return null;
  return {
    id: `youtube:${v.video_id}`,
    title,
    artist: v.author?.name || 'YouTube',
    durationSec: v.duration?.seconds ?? 0,
    artworkUrl: v.best_thumbnail?.url ?? v.thumbnails?.[0]?.url,
    source: 'youtube',
  };
}

async function searchOnDevice(query: string, limit: number): Promise<Track[]> {
  const yt = await getSession();
  const res = await yt.search(query, { type: 'video' });
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const node of res.videos) {
    const track = nodeToTrack(node);
    // No lives / upcoming streams (duration 0) and no duplicate videos.
    if (!track || track.durationSec <= 0 || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
    if (out.length >= limit) break;
  }
  return out;
}

/** Thrown when the video itself can't be played (removed, private, region-locked). */
class VideoGoneError extends Error {}

/** A direct audio URL plus the headers YouTube expects for it. */
interface ResolvedAudio {
  url: string;
  headers: Record<string, string>;
  mimeType: string;
  contentLength?: number;
  /** When the URL stops working (YouTube's `expire` parameter). */
  expiresAt: number;
}

/** Recently resolved URLs: prefetch fills this, play reads it. */
const urlCache = new Map<string, ResolvedAudio>();
/** One getBasicInfo per video at a time (prefetch and play may ask together). */
const resolving = new Map<string, Promise<ResolvedAudio>>();

function cacheUrl(id: string, audio: ResolvedAudio): ResolvedAudio {
  urlCache.set(id, audio);
  if (urlCache.size > URL_CACHE_MAX) {
    const oldest = urlCache.keys().next().value;
    if (oldest !== undefined) urlCache.delete(oldest);
  }
  return audio;
}

/** YouTube puts an `expire` epoch (seconds) in the URL; refresh a little early. */
function expiryOf(url: string): number {
  const m = /[?&]expire=(\d+)/.exec(url);
  if (!m) return Date.now() + URL_TTL_MS;
  return Number(m[1]) * 1000 - 2 * 60_000;
}

function chooseFormat(info: Awaited<ReturnType<Innertube['getBasicInfo']>>) {
  // m4a first (plays everywhere); WebM/Opus only on Android.
  for (const container of Platform.OS === 'ios' ? ['mp4'] : ['mp4', 'any']) {
    try {
      return info.chooseFormat({ type: 'audio', quality: 'best', format: container });
    } catch {
      // next container
    }
  }
  return undefined;
}

/**
 * Ask YouTube for a playable audio URL. No download.
 * `useCache = false` forces a fresh URL (expired links, HTTP 403 while downloading).
 */
async function resolveAudio(videoId: string, useCache = true): Promise<ResolvedAudio> {
  const cached = useCache ? urlCache.get(videoId) : undefined;
  if (cached && cached.expiresAt > Date.now()) return cached;

  const running = useCache ? resolving.get(videoId) : undefined;
  if (running) return running;

  const job = (async () => {
    const yt = await getSession();
    const info = await yt.getBasicInfo(videoId, { client: CLIENT });

    const ps = info.playability_status;
    if (ps && ps.status !== 'OK') {
      const reason = `${ps.status}: ${ps.reason || 'no reason given'}`;
      if (ps.status === 'ERROR' || ps.status === 'UNPLAYABLE') throw new VideoGoneError(reason);
      throw new Error(`YouTube refused (${reason})`);
    }

    const format = chooseFormat(info);
    if (!format) throw new Error('no audio format in VISIONOS response');
    const url = format.url ?? (await format.decipher(undefined));
    if (!url) throw new Error('VISIONOS format has no URL');

    const ua = (loadModule().Constants.CLIENTS as Record<string, { USER_AGENT?: string }>)[CLIENT]
      ?.USER_AGENT;
    return cacheUrl(videoId, {
      url,
      headers: ua ? { 'User-Agent': ua } : {},
      mimeType: format.mime_type,
      contentLength: format.content_length,
      expiresAt: expiryOf(url),
    });
  })().finally(() => resolving.delete(videoId));

  resolving.set(videoId, job);
  return job;
}

/** Download one video with the resolved URL. Returns a file:// URI. */
async function downloadOnDevice(videoId: string): Promise<string> {
  const started = Date.now();
  const audio = await resolveAudio(videoId);
  const ext = audio.mimeType.startsWith('audio/webm') ? 'webm' : 'm4a';
  const uri = await downloadMedia(
    audio.url,
    CACHE_FOLDER,
    `${videoId}.${ext}`,
    audio.contentLength,
    { headers: audio.headers },
  );
  log(
    `${videoId}: downloaded ${Math.round((audio.contentLength ?? 0) / 1024)} KB in ` +
      `${Date.now() - started} ms`,
  );
  return uri;
}

/** Download, and on an expired URL (403/410) resolve once more and retry. */
async function downloadWithRetry(videoId: string): Promise<string> {
  try {
    return await downloadOnDevice(videoId);
  } catch (err) {
    if (
      !(err instanceof MediaDownloadError) ||
      (err.status !== 403 && err.status !== 410)
    ) {
      throw err;
    }
    log(`${videoId}: download got HTTP ${err.status}, resolving a fresh URL`);
    await resolveAudio(videoId, false);
    return downloadOnDevice(videoId);
  }
}

// ---- Server fallback ----

interface ServerTrack {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  artworkUrl?: string;
}

function serverClient(serverUrl: string, key: string) {
  const base = serverUrl.replace(/\/+$/, '');
  const url = (path: string, params: Record<string, string | number | undefined> = {}) =>
    buildUrl(`${base}${path}`, { ...params, key: key || undefined });
  return {
    async search(q: string, limit: number): Promise<Track[]> {
      const { results } = await fetchJson<{ results: ServerTrack[] }>(url('/search', { q, limit }), {
        timeoutMs: SERVER_TIMEOUT_MS,
      });
      return (results ?? []).map((t) => ({ ...t, id: `youtube:${t.id}`, source: 'youtube' as const }));
    },
    async streamUrl(id: string): Promise<string> {
      try {
        await fetchJson(url('/resolve', { id }), { timeoutMs: SERVER_TIMEOUT_MS });
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) throw new VideoGoneError('removed');
        throw err;
      }
      return url('/stream', { id });
    },
  };
}

// ---- Adapter ----

/** One download per video at a time (playback fallback and Save to phone may ask together). */
const inflight = new Map<string, Promise<string>>();

export function createYouTubeSource(config: YouTubeConfig = {}): MusicSource {
  const server = config.serverUrl ? serverClient(config.serverUrl, config.serverKey ?? '') : null;
  const videoId = (track: Track) => track.id.replace(/^youtube:/, '');

  /** Local file: cache hit, or a fresh download (with server fallback). */
  const resolvedDownload = (id: string): Promise<string> => {
    const cached = getCachedMedia(CACHE_FOLDER, id);
    if (cached) return Promise.resolve(cached);
    const running = inflight.get(id);
    if (running) return running;

    const job = (async () => {
      try {
        return await downloadWithRetry(id);
      } catch (err) {
        if (err instanceof VideoGoneError || !server) throw err;
        log(`${id}: on-device download failed (${errText(err)}), using server`);
        return server.streamUrl(id);
      }
    })().finally(() => inflight.delete(id));
    inflight.set(id, job);
    return job;
  };

  return {
    id: 'youtube',
    label: 'YouTube',

    async search(query, limit = 20) {
      try {
        const tracks = await searchOnDevice(query, limit);
        reportWorking();
        return tracks;
      } catch (err) {
        if (server) {
          log(`search on-device failed (${errText(err)}), using server`);
          return server.search(query, limit);
        }
        reportFailure('search', 'YouTube search failed.', [errText(err)]);
        throw err;
      }
    },

    /** Player path: stream the googlevideo URL directly (no download). */
    async getPlaybackSource(track): Promise<PlaybackSource> {
      const id = videoId(track);
      const cached = getCachedMedia(CACHE_FOLDER, id);
      if (cached) return { uri: cached };

      try {
        const audio = await resolveAudio(id);
        reportWorking();
        // A 1-hour video is streamed only: downloading it as a "fallback" would take forever.
        const shortEnough = track.durationSec > 0 && track.durationSec <= 20 * 60;
        return {
          uri: audio.url,
          headers: audio.headers,
          canDownloadFallback: shortEnough,
        };
      } catch (err) {
        if (err instanceof VideoGoneError) throw new TrackUnavailableError(err.message);
        if (server) {
          log(`${id}: on-device stream failed (${errText(err)}), using server`);
          return { uri: await server.streamUrl(id) };
        }
        reportFailure('stream', 'Could not load this YouTube song.', [errText(err)]);
        throw err;
      }
    },

    /** Download path: Save to phone and the player's fallback when streaming fails. */
    async getStreamUrl(track) {
      try {
        const uri = await resolvedDownload(videoId(track));
        reportWorking();
        return uri;
      } catch (err) {
        if (err instanceof VideoGoneError) throw new TrackUnavailableError(err.message);
        const status = err instanceof MediaDownloadError ? err.status : undefined;
        reportFailure(
          status ? `http-${status}` : 'stream',
          status === 403
            ? 'YouTube cut the stream (403). The VISIONOS trick may have stopped working.'
            : 'Could not load this YouTube song.',
          [errText(err)],
        );
        throw err;
      }
    },

    /** Warm the playable URL only: no bytes until the song actually starts. */
    async prefetch(track) {
      const id = videoId(track);
      if (getCachedMedia(CACHE_FOLDER, id)) return;
      try {
        await resolveAudio(id);
      } catch {
        if (server) await server.streamUrl(id).catch(() => {});
      }
    },

    async checkHealth() {
      const steps: string[] = [
        `Server fallback: ${server ? 'configured' : 'not set'}`,
      ];
      try {
        const t0 = Date.now();
        await getSession();
        steps.push(`Session: OK (${Date.now() - t0} ms)`);
        const t1 = Date.now();
        const results = await searchOnDevice('arijit singh', 3);
        steps.push(`Search: OK (${results.length} results, ${Date.now() - t1} ms)`);
        const first = results[0];
        if (first) {
          const t2 = Date.now();
          const audio = await resolveAudio(videoId(first), false);
          const kb = Math.round((audio.contentLength ?? 0) / 1024);
          steps.push(`Stream URL: OK (${Date.now() - t2} ms${kb ? `, ${kb} KB` : ''})`);
        }
        const health: SourceHealth = { ok: true, message: 'Working', details: steps, checkedAt: Date.now() };
        saveHealth(health);
        return health;
      } catch (err) {
        steps.push(`On-device: ${errText(err)}`);
        if (server) {
          try {
            const t = Date.now();
            const tracks = await server.search('arijit singh', 3);
            steps.push(`Server: OK (${tracks.length} results, ${Date.now() - t} ms)`);
            const health: SourceHealth = {
              ok: true,
              message: 'Working (server fallback)',
              details: steps,
              checkedAt: Date.now(),
            };
            saveHealth(health);
            return health;
          } catch (serverErr) {
            steps.push(`Server: ${errText(serverErr)}`);
          }
        }
        const health: SourceHealth = {
          ok: false,
          stage: 'on-device',
          message: 'YouTube on-device failed.',
          details: steps,
          fix: 'Try "npm update youtubei.js". If YouTube changed things, set the SONIQ server in .env as a fallback.',
          checkedAt: Date.now(),
        };
        saveHealth(health);
        return health;
      }
    },
  };
}

/** Test-only. */
export function __resetYouTubeForTests(): void {
  ytModule = null;
  sessionPromise = null;
  inflight.clear();
  urlCache.clear();
  resolving.clear();
}
