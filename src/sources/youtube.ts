/**
 * YouTube source. PERSONAL USE ONLY, never ship this in a Play Store build.
 *
 * On-device (default, no server needed): youtubei.js with the VISIONOS client. That client
 * needs no PO token and no JS challenge (verified with yt-dlp on the phone, 2026-10-17),
 * unlike MWEB/WEB/IOS/ANDROID_VR which YouTube cuts off after ~1 MB. The audio is
 * downloaded to the cache with Range requests and played as a local file, so background
 * play works and replays are instant/offline.
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
import type { MusicSource, SourceHealth, Track } from './types';

type YouTubeModule = typeof import('youtubei.js');

const CLIENT = 'VISIONOS' as const;
const CACHE_FOLDER = 'youtube';
/** Free hosts sleep when idle; the first server request can take up to a minute. */
const SERVER_TIMEOUT_MS = 70_000;

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
  return res.videos
    .map(nodeToTrack)
    .filter((t): t is Track => t !== null && t.durationSec > 0)
    .slice(0, limit);
}

/** Thrown when the video itself can't be played (removed, private, region-locked). */
class VideoGoneError extends Error {}

/** Resolve + download one video on-device. Returns a file:// URI. */
async function resolveOnDevice(videoId: string): Promise<string> {
  const started = Date.now();
  const yt = await getSession();
  const info = await yt.getBasicInfo(videoId, { client: CLIENT });

  const ps = info.playability_status;
  if (ps && ps.status !== 'OK') {
    const reason = `${ps.status}: ${ps.reason || 'no reason given'}`;
    if (ps.status === 'ERROR' || ps.status === 'UNPLAYABLE') throw new VideoGoneError(reason);
    throw new Error(`YouTube refused (${reason})`);
  }

  // m4a first (plays everywhere); WebM/Opus only on Android.
  let format: ReturnType<typeof info.chooseFormat> | undefined;
  for (const container of Platform.OS === 'ios' ? ['mp4'] : ['mp4', 'any']) {
    try {
      format = info.chooseFormat({ type: 'audio', quality: 'best', format: container });
      break;
    } catch {
      // next container
    }
  }
  if (!format) throw new Error('no audio format in VISIONOS response');
  const url = format.url ?? (await format.decipher(undefined));
  if (!url) throw new Error('VISIONOS format has no URL');
  const resolvedAt = Date.now();

  const ua = (loadModule().Constants.CLIENTS as Record<string, { USER_AGENT?: string }>)[CLIENT]
    ?.USER_AGENT;
  const ext = format.mime_type.startsWith('audio/webm') ? 'webm' : 'm4a';
  const uri = await downloadMedia(url, CACHE_FOLDER, `${videoId}.${ext}`, format.content_length, {
    headers: ua ? { 'User-Agent': ua } : {},
  });
  log(
    `${videoId}: resolved in ${resolvedAt - started} ms, downloaded ` +
      `${Math.round((format.content_length ?? 0) / 1024)} KB in ${Date.now() - resolvedAt} ms`,
  );
  return uri;
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

/** One resolve per video at a time (playback and prefetch may ask together). */
const inflight = new Map<string, Promise<string>>();

export function createYouTubeSource(config: YouTubeConfig = {}): MusicSource {
  const server = config.serverUrl ? serverClient(config.serverUrl, config.serverKey ?? '') : null;
  const videoId = (track: Track) => track.id.replace(/^youtube:/, '');

  const resolve = (id: string, useCache = true): Promise<string> => {
    const cached = useCache ? getCachedMedia(CACHE_FOLDER, id) : null;
    if (cached) return Promise.resolve(cached);
    const running = inflight.get(id);
    if (running) return running;

    const job = (async () => {
      try {
        return await resolveOnDevice(id);
      } catch (err) {
        if (err instanceof VideoGoneError || !server) throw err;
        log(`${id}: on-device failed (${errText(err)}), using server`);
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

    async getStreamUrl(track) {
      try {
        const uri = await resolve(videoId(track));
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
        const t0 = Date.now();
        await getSession();
        steps.push(`Session: OK (${Date.now() - t0} ms)`);
        const t1 = Date.now();
        const results = await searchOnDevice('arijit singh', 3);
        steps.push(`Search: OK (${results.length} results, ${Date.now() - t1} ms)`);
        const first = results[0];
        if (first) {
          const t2 = Date.now();
          await resolve(videoId(first), false);
          steps.push(`Stream: OK (${Date.now() - t2} ms)`);
        }
        const health: SourceHealth = { ok: true, message: 'Working', details: steps, checkedAt: Date.now() };
        saveHealth(health);
        return health;
      } catch (err) {
        const health: SourceHealth = {
          ok: false,
          stage: 'on-device',
          message: 'YouTube on-device failed.',
          details: [...steps, errText(err)],
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
}
