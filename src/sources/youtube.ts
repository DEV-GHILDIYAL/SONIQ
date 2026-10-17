/**
 * YouTube source. PERSONAL TESTING ONLY, never ship this in a Play Store build.
 *
 * youtubei.js talks to YouTube's InnerTube API from the phone itself (no server).
 * The resolved URL plays through the normal expo-audio engine, so background
 * playback and lock-screen controls work like for every other source.
 *
 * YouTube only serves full streams to clients with a PO token (proof of origin).
 * The token is minted by YouTube's own BotGuard running in a hidden WebView
 * (src/components/PoTokenWebView.tsx, src/lib/poToken.ts). Audio is downloaded to the
 * cache with Range requests and played as a local file (ExoPlayer's direct request gets 403).
 *
 * YouTube changes its internals often. Every failure is tagged with the stage
 * where it broke (YouTubeStage). The stage shows up in the player error and in
 * Settings > Music sources > YouTube (tap the row to run a self-test).
 */
import { Platform } from 'react-native';
import type { Innertube, Types } from 'youtubei.js';

import { TrackUnavailableError } from '@/lib/errors';
import { fetchStatus } from '@/lib/fetch';
import { FileKvCache } from '@/lib/fileKvCache';
import { downloadMedia, getCachedMedia, MediaDownloadError } from '@/lib/mediaCache';
import { mintPoTokens } from '@/lib/poToken';
import { useSourceHealthStore } from '@/store/sourceHealthStore';
import type { MusicSource, SourceHealth, Track } from './types';

type YouTubeModule = typeof import('youtubei.js');

/** Where a YouTube request broke. Order of the pipeline: session -> search / info -> decipher -> stream. */
export type YouTubeStage =
  'network' | 'session' | 'potoken' | 'search' | 'blocked' | 'formats' | 'decipher' | 'stream';

const STAGE_HELP: Record<YouTubeStage, string> = {
  network: "Can't reach YouTube. Check your internet connection.",
  session: 'Could not start a YouTube session (YouTube changed its config/handshake).',
  potoken:
    'Could not get a PO token (BotGuard in the hidden WebView failed). Without it YouTube only serves the first ~1 MB.',
  search: 'YouTube changed the format of its search results.',
  blocked: 'YouTube is asking this device for a bot check / sign-in.',
  formats: 'YouTube returned no playable audio streams.',
  decipher: 'Could not decode the stream URL (YouTube changed its player script).',
  stream: 'YouTube rejected the stream URL (HTTP error).',
};

const FIX_HINT =
  'Most likely YouTube changed something. Fix: run "npm update youtubei.js" and reload the app. ' +
  'Still broken? Search the error on github.com/LuanRT/YouTube.js/issues and wait for a library update.';

/**
 * Clients tried in order when resolving a stream. MWEB/WEB use the PO token;
 * the app clients are a fallback for when BotGuard is broken.
 */
const CLIENTS: Types.InnerTubeClient[] = ['MWEB', 'WEB', 'ANDROID_VR', 'IOS'];
const PO_TOKEN_CLIENTS = new Set<string>(['MWEB', 'WEB']);

/** Recreate the session (and its PO token) after this long. */
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Cache folder for downloaded YouTube audio (see src/lib/mediaCache.ts). */
const CACHE_FOLDER = 'youtube';

/** Stable public video used by the self-test ("Me at the zoo"). */
const TEST_VIDEO_ID = 'jNQXAC9IVRw';

export class YouTubeError extends Error {
  constructor(
    readonly stage: YouTubeStage,
    readonly details: string[] = [],
  ) {
    super(
      stage === 'network'
        ? STAGE_HELP.network
        : `YouTube broke at "${stage}". Update youtubei.js (details: Settings > YouTube).`,
    );
    this.name = 'YouTubeError';
  }
}

type AttemptStage = YouTubeStage | 'unavailable';
interface Attempt {
  client: string;
  stage: AttemptStage;
  detail: string;
}

/** Step-by-step trace in the Metro terminal (dev builds only). */
const log = (...args: unknown[]) => {
  if (__DEV__) console.log('[youtube]', ...args);
};

const errText = (err: unknown) =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err);

const isNetworkError = (err: unknown) =>
  err instanceof TypeError && /network request failed|failed to fetch|network/i.test(err.message);

/** Download errors without an HTTP status are usually connectivity problems. */
const isNetworkLike = (err: unknown) =>
  err instanceof MediaDownloadError &&
  /network|timeout|resolve host|connect|socket/i.test(err.message);

// ---- Library + session (lazy: the library is big and only needed when YouTube is used) ----

interface YtSession {
  yt: Innertube;
  visitorData: string;
  /** PO token bound to visitorData; undefined if BotGuard failed. */
  poToken?: string;
  poTokenError?: string;
  createdAt: number;
}

let ytModule: YouTubeModule | null = null;
let ytCache: FileKvCache | null = null;
let sessionPromise: Promise<YtSession> | null = null;

function loadModule(): YouTubeModule {
  if (!ytModule) {
    // Lazy require keeps app start fast and lets tests mock the library.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('youtubei.js') as YouTubeModule;
    // youtubei.js needs to run a small piece of YouTube's player JS to decode stream URLs.
    // Hermes can compile code at runtime, so the Function constructor is enough.
    mod.Platform.shim.eval = (data) => new Function(data.output)();
    ytModule = mod;
  }
  return ytModule;
}

async function createSession(): Promise<YtSession> {
  const { Innertube: Client } = loadModule();
  ytCache ??= new FileKvCache('youtubei-cache');
  const started = Date.now();
  // The disk cache keeps the parsed player script + session between app starts.
  const yt = await Client.create({ location: 'IN', retrieve_player: true, cache: ytCache });
  const visitorData = yt.session.context.client.visitorData ?? '';
  log(`session ready in ${Date.now() - started} ms, player loaded: ${!!yt.session.player}`);

  const session: YtSession = { yt, visitorData, createdAt: Date.now() };
  if (!visitorData) {
    session.poTokenError = 'session has no visitorData';
    return session;
  }
  try {
    const t0 = Date.now();
    const [token] = await mintPoTokens([visitorData]);
    if (!token) throw new Error('empty PO token');
    session.poToken = token;
    // Used for player requests and added as `pot` to every deciphered stream URL.
    yt.session.po_token = token;
    if (yt.session.player) yt.session.player.po_token = token;
    log(`PO token ready in ${Date.now() - t0} ms`);
  } catch (err) {
    session.poTokenError = errText(err);
    log(`PO token failed: ${session.poTokenError}`);
  }
  return session;
}

function getSession(): Promise<YtSession> {
  if (sessionPromise) {
    // Drop sessions older than the PO token lifetime.
    void sessionPromise.then(
      (s) => {
        if (Date.now() - s.createdAt > SESSION_MAX_AGE_MS) sessionPromise = null;
      },
      () => {},
    );
  }
  if (!sessionPromise) {
    sessionPromise = createSession().catch((err: unknown) => {
      sessionPromise = null; // retry on the next call
      throw new YouTubeError(isNetworkError(err) ? 'network' : 'session', [
        `Session: ${errText(err)}`,
      ]);
    });
  }
  return sessionPromise;
}

/** User-Agent of the InnerTube client that produced a stream URL (YouTube may check it). */
function clientUserAgent(client: Types.InnerTubeClient): string | undefined {
  const clients = loadModule().Constants.CLIENTS as Record<string, { USER_AGENT?: string }>;
  return clients[client]?.USER_AGENT;
}

let diagnosed = false;

/**
 * Dev-only: when a download fails, probe a few request shapes once per session and
 * log which ones YouTube accepts. Tells us exactly what changed on YouTube's side.
 */
async function diagnoseStream(
  client: string,
  url: string,
  totalBytes: number | undefined,
  ua?: string,
) {
  if (!__DEV__ || diagnosed) return;
  diagnosed = true;
  const MB = 1024 * 1024;
  const withUa: Record<string, string> = ua ? { 'User-Agent': ua } : {};
  const sep = url.includes('?') ? '&' : '?';
  const cases: [string, string, Record<string, string>][] = [
    ['0-0', url, { ...withUa, Range: 'bytes=0-0' }],
    ['0-256K', url, { ...withUa, Range: `bytes=0-${256 * 1024 - 1}` }],
    ['0-1M', url, { ...withUa, Range: `bytes=0-${MB - 1}` }],
    ['0-1M noUA', url, { Range: `bytes=0-${MB - 1}` }],
    ['1M-2M', url, { ...withUa, Range: `bytes=${MB}-${2 * MB - 1}` }],
    ['full', url, { ...withUa, Range: `bytes=0-${totalBytes ? totalBytes - 1 : ''}` }],
    ['param 0-1M', `${url}${sep}range=0-${MB - 1}`, withUa],
  ];
  const results: string[] = [];
  for (const [name, u, headers] of cases) results.push(`${name}=${await fetchStatus(u, headers)}`);
  log(`diag ${client}: ${results.join(', ')}`);
}

// ---- Health reporting ----

function saveHealth(health: SourceHealth): void {
  useSourceHealthStore.getState().set('youtube', health);
}

function healthFromError(err: unknown, steps: string[] = []): SourceHealth {
  const yt = err instanceof YouTubeError ? err : null;
  const stage: YouTubeStage = yt?.stage ?? 'formats';
  return {
    ok: false,
    stage,
    message: STAGE_HELP[stage],
    details: [...steps, ...(yt ? yt.details : [errText(err)])],
    fix: stage === 'network' ? undefined : FIX_HINT,
    checkedAt: Date.now(),
  };
}

/** Record a real-world failure (not offline: that is not YouTube's fault). */
function reportFailure(err: unknown): void {
  if (err instanceof YouTubeError && err.stage !== 'network') {
    saveHealth(healthFromError(err));
    console.warn(`[youtube] broke at "${err.stage}"\n  ${err.details.join('\n  ')}`);
  }
}

/** Flip a previously broken status back to working (only writes when it changes). */
function reportWorking(): void {
  const prev = useSourceHealthStore.getState().bySource.youtube;
  if (prev && !prev.ok) {
    saveHealth({ ok: true, message: 'Working', details: [], checkedAt: Date.now() });
  }
}

// ---- Search ----

/** Duck-typed view of the search nodes we use (Video, CompactVideo, ...). */
interface VideoNodeLike {
  video_id?: string;
  title?: { toString(): string };
  author?: { name?: string };
  duration?: { seconds?: number };
  best_thumbnail?: { url?: string };
  thumbnails?: { url?: string }[];
}

function toTrack(node: unknown): Track | null {
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

async function searchTracks(query: string, limit: number): Promise<Track[]> {
  const { yt } = await getSession();
  let res: Awaited<ReturnType<Innertube['search']>>;
  try {
    res = await yt.search(query, { type: 'video' });
  } catch (err) {
    throw new YouTubeError(isNetworkError(err) ? 'network' : 'search', [`Search: ${errText(err)}`]);
  }
  const tracks = res.videos
    .map(toTrack)
    .filter((t): t is Track => t !== null)
    .slice(0, limit);
  if (tracks.length === 0 && res.results.length > 0) {
    // YouTube answered but we understood none of it: the response format changed.
    const types = [...new Set(res.results.map((r) => r.type))].join(', ');
    throw new YouTubeError('search', [
      `Search: ${res.results.length} results, none parsed (node types: ${types})`,
    ]);
  }
  return tracks;
}

// ---- Stream ----

/** Replace (or add) the `pot` query parameter of a stream URL. */
function withPot(url: string, pot: string): string {
  const u = new URL(url);
  u.searchParams.set('pot', pot);
  return u.toString();
}

async function tryClient(
  session: YtSession,
  videoId: string,
  client: Types.InnerTubeClient,
): Promise<string | Attempt> {
  const { yt } = session;
  let info: Awaited<ReturnType<Innertube['getBasicInfo']>>;
  try {
    info = await yt.getBasicInfo(videoId, { client });
  } catch (err) {
    return { client, stage: isNetworkError(err) ? 'network' : 'formats', detail: errText(err) };
  }

  const ps = info.playability_status;
  log(`${client}: playability ${ps?.status ?? 'none'} ${ps?.reason ?? ''}`);
  if (ps && ps.status !== 'OK') {
    // ERROR / UNPLAYABLE = the video itself is gone or restricted. Anything else
    // (LOGIN_REQUIRED "confirm you're not a bot", ...) = YouTube is blocking us.
    const stage: AttemptStage =
      ps.status === 'ERROR' || ps.status === 'UNPLAYABLE' ? 'unavailable' : 'blocked';
    return { client, stage, detail: `${ps.status}: ${ps.reason || 'no reason given'}` };
  }

  // m4a first: plays everywhere. WebM/Opus only on Android (iOS can't play it).
  let format: ReturnType<typeof info.chooseFormat> | undefined;
  for (const container of Platform.OS === 'ios' ? ['mp4'] : ['mp4', 'any']) {
    try {
      format = info.chooseFormat({ type: 'audio', quality: 'best', format: container });
      break;
    } catch {
      // try the next container
    }
  }
  if (!format) {
    const total = info.streaming_data?.adaptive_formats.length ?? 0;
    return { client, stage: 'formats', detail: `no audio format (${total} formats in response)` };
  }

  log(`${client}: format itag ${format.itag} ${format.mime_type} ${format.bitrate}bps`);
  let url: string;
  try {
    url = await format.decipher(yt.session.player);
  } catch (err) {
    return { client, stage: 'decipher', detail: errText(err) };
  }
  if (!url) return { client, stage: 'decipher', detail: 'decipher returned an empty URL' };

  // ExoPlayer streaming this URL directly gets HTTP 403 (YouTube rejects its un-ranged
  // request), so download it with Range requests into the cache and play the local file.
  // Bonus: replays are instant and work offline.
  const ext = format.mime_type.startsWith('audio/webm') ? 'webm' : 'm4a';
  const ua = clientUserAgent(client);
  const download = async (streamUrl: string, label: string): Promise<string> => {
    const started = Date.now();
    const uri = await downloadMedia(
      streamUrl,
      CACHE_FOLDER,
      `${videoId}.${ext}`,
      format.content_length,
      {
        headers: ua ? { 'User-Agent': ua } : {},
      },
    );
    log(
      `${client}${label}: downloaded ${format.content_length ?? '?'} bytes in ${Date.now() - started} ms`,
    );
    return uri;
  };

  const usesPot = PO_TOKEN_CLIENTS.has(client) && !!session.poToken;
  let lastErr: unknown;
  try {
    return await download(url, usesPot ? ' (session pot)' : '');
  } catch (err) {
    lastErr = err;
    log(`${client}: download failed: ${errText(err)}`);
  }

  // Some videos want a token bound to the video id instead of the session.
  if (usesPot && lastErr instanceof MediaDownloadError && lastErr.status === 403) {
    try {
      const [videoPot] = await mintPoTokens([videoId]);
      if (videoPot) return await download(withPot(url, videoPot), ' (video pot)');
    } catch (err) {
      lastErr = err;
      log(`${client}: video-bound pot failed: ${errText(err)}`);
    }
  }

  await diagnoseStream(client, url, format.content_length, ua);
  const status = lastErr instanceof MediaDownloadError ? lastErr.status : undefined;
  if (status === undefined && isNetworkLike(lastErr)) {
    return { client, stage: 'network', detail: `download: ${errText(lastErr)}` };
  }
  return {
    client,
    stage: 'stream',
    detail: `download failed: ${status ? `HTTP ${status}` : errText(lastErr)}`,
  };
}

/** Most useful stage to show when every client failed. */
const STAGE_PRIORITY: YouTubeStage[] = ['stream', 'decipher', 'blocked', 'formats'];

/** One download per video at a time (playback and prefetch may ask together). */
const inflight = new Map<string, Promise<string>>();

function resolveStream(videoId: string, useCache = true): Promise<string> {
  const cached = useCache ? getCachedMedia(CACHE_FOLDER, videoId) : null;
  if (cached) {
    log(`${videoId}: playing from cache`);
    return Promise.resolve(cached);
  }
  const running = inflight.get(videoId);
  if (running) return running;
  const job = resolveFromYouTube(videoId).finally(() => inflight.delete(videoId));
  inflight.set(videoId, job);
  return job;
}

async function resolveFromYouTube(videoId: string): Promise<string> {
  const session = await getSession();
  const attempts: Attempt[] = [];
  for (const client of CLIENTS) {
    const result = await tryClient(session, videoId, client);
    if (typeof result === 'string') return result;
    attempts.push(result);
    if (result.stage === 'network') break; // offline: other clients won't help
  }

  const details = attempts.map((a) => `${a.client}: ${a.stage} - ${a.detail}`);
  if (session.poTokenError) details.unshift(`PO token: ${session.poTokenError}`);
  if (attempts.some((a) => a.stage === 'network')) throw new YouTubeError('network', details);
  if (attempts.every((a) => a.stage === 'unavailable')) {
    throw new TrackUnavailableError(attempts[0]?.detail ?? 'This YouTube video is not available');
  }
  let stage = STAGE_PRIORITY.find((s) => attempts.some((a) => a.stage === s)) ?? 'formats';
  // 403s without a PO token: the real cause is BotGuard, not the stream.
  if (stage === 'stream' && !session.poToken) stage = 'potoken';
  throw new YouTubeError(stage, details);
}

// ---- Adapter ----

export const youtubeSource: MusicSource = {
  id: 'youtube',
  label: 'YouTube',

  async search(query, limit = 20) {
    try {
      const tracks = await searchTracks(query, limit);
      reportWorking();
      return tracks;
    } catch (err) {
      reportFailure(err);
      throw err;
    }
  },

  async getStreamUrl(track) {
    const videoId = track.id.replace(/^youtube:/, '');
    try {
      const url = await resolveStream(videoId);
      reportWorking();
      return url;
    } catch (err) {
      if (!(err instanceof YouTubeError) || err.stage === 'network') throw err;
      // One retry with a fresh session (new visitor data + fresh player script).
      sessionPromise = null;
      try {
        const url = await resolveStream(videoId);
        reportWorking();
        return url;
      } catch (retryErr) {
        reportFailure(retryErr);
        throw retryErr;
      }
    }
  },

  async prefetch(track) {
    try {
      await resolveStream(track.id.replace(/^youtube:/, ''));
    } catch {
      // Prefetch is best effort; real playback reports errors.
    }
  },

  async checkHealth() {
    const steps: string[] = [];
    try {
      const session = await getSession();
      steps.push('Session: OK');
      steps.push(session.poToken ? 'PO token: OK' : `PO token: FAILED (${session.poTokenError})`);
      const results = await searchTracks('lofi hip hop', 5);
      steps.push(`Search: OK (${results.length} results)`);
      await resolveStream(TEST_VIDEO_ID, false);
      steps.push('Stream: OK');
      const health: SourceHealth = {
        ok: true,
        message: 'Working',
        details: steps,
        checkedAt: Date.now(),
      };
      saveHealth(health);
      return health;
    } catch (err) {
      const health = healthFromError(err, steps);
      if (health.stage !== 'network') saveHealth(health);
      return health;
    }
  },
};

/** Test-only: drop the cached library and session. */
export function __resetYouTubeForTests(): void {
  ytModule = null;
  ytCache = null;
  sessionPromise = null;
  diagnosed = false;
  inflight.clear();
}
