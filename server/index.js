/**
 * SONIQ backend: YouTube search + audio proxy via yt-dlp. PERSONAL USE ONLY.
 *
 *   GET /health                  -> { ok, ytdlp }               (no key needed)
 *   GET /search?q=...&limit=20   -> { results: Track-like[] }
 *   GET /resolve?id=VIDEO_ID     -> { id, durationSec, mimeType } (warms the stream cache)
 *   GET /stream?id=VIDEO_ID      -> audio bytes (supports Range, so seeking works)
 *
 * Why a proxy and not just a URL: googlevideo URLs are bound to the IP that resolved
 * them (this server), so the phone can't use them directly. The server fetches the
 * audio in <= 8 MB Range chunks (YouTube throttles/403s bigger ones) and streams it on.
 *
 * Env: PORT, API_KEY (required in production), YTDLP_PATH, YTDLP_COOKIES (optional,
 * Netscape cookies.txt content of a throwaway account, helps against bot checks).
 */
import express from 'express';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.API_KEY ?? '';
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const UPSTREAM_CHUNK = 8 * 1024 * 1024;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const ID_RE = /^[\w-]{11}$/;

const baseArgs = ['--no-warnings', '--no-playlist', '--ignore-config'];
if (process.env.YTDLP_COOKIES) {
  const cookiesFile = join(tmpdir(), 'soniq-cookies.txt');
  writeFileSync(cookiesFile, process.env.YTDLP_COOKIES);
  baseArgs.push('--cookies', cookiesFile);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---- yt-dlp ----

/** Run yt-dlp and resolve with stdout. Rejects with the last stderr lines. */
function ytdlp(args, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, [...baseArgs, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new HttpError(504, 'yt-dlp timed out'));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new HttpError(500, `yt-dlp not runnable: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out);
      const msg = err.trim().split('\n').slice(-3).join(' | ') || `yt-dlp exited ${code}`;
      reject(new HttpError(classify(msg), msg));
    });
  });
}

/** Map yt-dlp errors to HTTP status codes the app understands. */
function classify(msg) {
  if (/video unavailable|private video|removed|does not exist|not available in your country/i.test(msg)) {
    return 404;
  }
  if (/sign in to confirm|not a bot|429|too many requests/i.test(msg)) return 429;
  return 502;
}

// ---- Search ----

const searchCache = new Map(); // key -> { at, results }

function bestThumb(entry) {
  const thumbs = Array.isArray(entry.thumbnails) ? entry.thumbnails : [];
  const last = thumbs[thumbs.length - 1]?.url;
  return last || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
}

async function search(q, limit) {
  const key = `${limit}:${q.toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.results;

  const json = JSON.parse(await ytdlp(['--flat-playlist', '-J', `ytsearch${limit}:${q}`], 45_000));
  const results = (json.entries ?? [])
    .filter((e) => e && ID_RE.test(e.id ?? '') && e.duration) // no lives / shorts without duration
    .map((e) => ({
      id: e.id,
      title: e.title ?? 'Untitled',
      artist: e.channel ?? e.uploader ?? 'YouTube',
      durationSec: Math.round(e.duration ?? 0),
      artworkUrl: bestThumb(e),
    }));
  searchCache.set(key, { at: Date.now(), results });
  if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value);
  return results;
}

// ---- Stream resolve (cached per video until the URL expires) ----

const streamCache = new Map(); // id -> { url, headers, mimeType, durationSec, size, expiresAt }
const inflight = new Map();

async function resolveStream(id, force = false) {
  const cached = streamCache.get(id);
  if (!force && cached && cached.expiresAt > Date.now()) return cached;
  if (!force && inflight.has(id)) return inflight.get(id);

  const job = (async () => {
    const info = JSON.parse(
      await ytdlp(['-f', 'bestaudio[ext=m4a]/bestaudio', '-j', `https://www.youtube.com/watch?v=${id}`]),
    );
    if (!info.url) throw new HttpError(502, 'yt-dlp returned no stream URL');
    const expire = Number(new URL(info.url).searchParams.get('expire')) * 1000;
    const entry = {
      url: info.url,
      headers: info.http_headers ?? {},
      mimeType: info.ext === 'webm' ? 'audio/webm' : 'audio/mp4',
      durationSec: Math.round(info.duration ?? 0),
      size: info.filesize ?? info.filesize_approx ?? null,
      // Refresh 10 min before YouTube's expiry; 1 h if unknown.
      expiresAt: expire ? expire - 10 * 60 * 1000 : Date.now() + 60 * 60 * 1000,
    };
    streamCache.set(id, entry);
    return entry;
  })().finally(() => inflight.delete(id));

  inflight.set(id, job);
  return job;
}

/** One upstream Range request. */
function fetchRange(entry, from, to, signal) {
  return fetch(entry.url, {
    headers: { ...entry.headers, Range: `bytes=${from}-${to}` },
    signal,
  });
}

/** Parse "bytes start-end/total". */
function totalFromContentRange(value) {
  const m = /\/(\d+)$/.exec(value ?? '');
  return m ? Number(m[1]) : null;
}

// ---- HTTP ----

const app = express();
app.disable('x-powered-by');

// yt-dlp version is read once in the background, so /health answers instantly
// (Render's health check must not wait on a slow first yt-dlp start).
let ytdlpVersion = null;
let ytdlpError = null;
ytdlp(['--version'], 120_000)
  .then((v) => (ytdlpVersion = v.trim()))
  .catch((e) => (ytdlpError = e.message));

app.get('/health', (_req, res) => {
  res.json({ ok: true, ytdlp: ytdlpVersion, ytdlpError });
});

// Everything below needs the key (header x-api-key or ?key=, the player can only do query).
app.use((req, res, next) => {
  if (!API_KEY) return next(); // local dev without a key
  const key = req.get('x-api-key') ?? req.query.key;
  if (key === API_KEY) return next();
  res.status(401).json({ error: 'bad or missing API key' });
});

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    const status = e.status ?? 500;
    console.error(`[${req.method} ${req.path}] ${status}: ${e.message}`);
    if (!res.headersSent) res.status(status).json({ error: e.message });
    else res.destroy();
  });

/** Verbose yt-dlp run for one video: shows exactly why YouTube refused (key required). */
app.get('/debug', (req, res) => {
  const id = String(req.query.id ?? '');
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'invalid id' });
  const child = spawn(
    YTDLP,
    [...baseArgs, '-v', '--simulate', '-f', 'bestaudio', `https://www.youtube.com/watch?v=${id}`],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), 90_000);
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  child.on('close', (code) => {
    clearTimeout(timer);
    // Drop cookie / header noise, keep the useful lines.
    const lines = log.split('\n').filter((l) => !/cookie|Authorization/i.test(l));
    res.type('text/plain').send(`exit ${code}\n\n${lines.join('\n')}`);
  });
});

app.get(
  '/search',
  wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ results: [] });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 30);
    res.json({ results: await search(q, limit) });
  }),
);

app.get(
  '/resolve',
  wrap(async (req, res) => {
    const id = String(req.query.id ?? '');
    if (!ID_RE.test(id)) throw new HttpError(400, 'invalid id');
    const s = await resolveStream(id);
    res.json({ id, durationSec: s.durationSec, mimeType: s.mimeType });
  }),
);

app.get(
  '/stream',
  wrap(async (req, res) => {
    const id = String(req.query.id ?? '');
    if (!ID_RE.test(id)) throw new HttpError(400, 'invalid id');

    // Client range (ExoPlayer sends "bytes=N-" when seeking).
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.get('range') ?? '');
    const start = m ? Number(m[1]) : 0;
    const wantedEnd = m && m[2] ? Number(m[2]) : null;

    const abort = new AbortController();
    res.on('close', () => abort.abort());

    // First chunk: also tells us the total size. Retry once with a fresh URL on 403/410.
    let entry = await resolveStream(id);
    const firstEnd = (from) => Math.min(from + UPSTREAM_CHUNK - 1, wantedEnd ?? Infinity);
    let up = await fetchRange(entry, start, firstEnd(start), abort.signal);
    if (up.status === 403 || up.status === 410) {
      entry = await resolveStream(id, true);
      up = await fetchRange(entry, start, firstEnd(start), abort.signal);
    }
    if (up.status === 416) return res.status(416).end();
    if (up.status !== 206 && up.status !== 200) {
      throw new HttpError(502, `upstream returned HTTP ${up.status}`);
    }

    const total = totalFromContentRange(up.headers.get('content-range')) ?? entry.size;
    if (!total) throw new HttpError(502, 'unknown stream size');
    const end = Math.min(wantedEnd ?? total - 1, total - 1);

    res.status(m ? 206 : 200);
    res.set({
      'Content-Type': entry.mimeType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Cache-Control': 'no-store',
      ...(m ? { 'Content-Range': `bytes ${start}-${end}/${total}` } : {}),
    });

    // Stream the first chunk, then keep fetching the next ones until `end`.
    let pos = start;
    let body = up.body;
    while (body) {
      for await (const part of body) {
        if (!res.write(part)) await new Promise((r) => res.once('drain', r));
        pos += part.length;
      }
      if (pos > end || abort.signal.aborted) break;
      const next = await fetchRange(entry, pos, Math.min(pos + UPSTREAM_CHUNK - 1, end), abort.signal);
      if (next.status !== 206 && next.status !== 200) {
        throw new HttpError(502, `upstream chunk at ${pos} returned HTTP ${next.status}`);
      }
      body = next.body;
    }
    res.end();
  }),
);

app.listen(PORT, () => {
  console.log(`SONIQ server on :${PORT}${API_KEY ? '' : ' (no API_KEY set: open access!)'}`);
});
