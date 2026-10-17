/**
 * Bridge between app code and the hidden PO token WebView (src/components/PoTokenWebView.tsx).
 * App code calls mintPoTokens() / runInWebView(); the WebView attaches itself as the host
 * and answers.
 */

/** Thrown when no PO token could be produced. `stage` says which step failed. */
export class PoTokenError extends Error {
  constructor(
    readonly stage: string,
    message: string,
  ) {
    super(message);
    this.name = 'PoTokenError';
  }
}

export interface PoTokenHost {
  /** Run JS inside the WebView. */
  run(js: string): void;
  /** Reload the WebView page (re-runs BotGuard from scratch). */
  reload(): void;
}

type InboundMessage =
  | { type: 'ready'; ttlSec: number }
  | { type: 'init-error'; stage: string; message: string }
  | { type: 'minted'; id: number; tokens: string[] }
  | { type: 'mint-error'; id: number; message: string }
  | { type: 'loaded' }
  | { type: 'eval-result'; id: number; result: unknown }
  | { type: 'eval-error'; id: number; message: string };

const READY_TIMEOUT_MS = 30_000;
const MINT_TIMEOUT_MS = 10_000;
const PAGE_LOAD_TIMEOUT_MS = 15_000;
const EVAL_TIMEOUT_MS = 10_000;
/** Treat the integrity token as expired a bit early. */
const TTL_SAFETY = 0.8;

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

interface Pending {
  resolve: (tokens: string[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let host: PoTokenHost | null = null;
let state: 'loading' | 'ready' | 'error' = 'loading';
let lastError: PoTokenError | null = null;
let expiresAt = 0;
let waiters: Waiter[] = [];
let nextId = 1;
const pending = new Map<number, Pending>();

interface PendingEval {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let pageLoaded = false;
let loadWaiters: (() => void)[] = [];
const pendingEvals = new Map<number, PendingEval>();

function settleWaiters(err?: Error): void {
  const list = waiters;
  waiters = [];
  for (const w of list) err ? w.reject(err) : w.resolve();
}

/** Called by the WebView component. Returns a detach function. */
export function attachPoTokenHost(h: PoTokenHost): () => void {
  host = h;
  state = 'loading';
  pageLoaded = false;
  return () => {
    if (host === h) host = null;
  };
}

/** Called by the WebView component with every message the page posts. */
export function handlePoTokenMessage(raw: string): void {
  let msg: InboundMessage;
  try {
    msg = JSON.parse(raw) as InboundMessage;
  } catch {
    return;
  }
  switch (msg.type) {
    case 'ready':
      state = 'ready';
      lastError = null;
      expiresAt = Date.now() + msg.ttlSec * 1000 * TTL_SAFETY;
      settleWaiters();
      break;
    case 'init-error':
      state = 'error';
      lastError = new PoTokenError(msg.stage, `BotGuard ${msg.stage}: ${msg.message}`);
      settleWaiters(lastError);
      break;
    case 'loaded': {
      pageLoaded = true;
      const list = loadWaiters;
      loadWaiters = [];
      for (const w of list) w();
      break;
    }
    case 'eval-result':
    case 'eval-error': {
      const p = pendingEvals.get(msg.id);
      if (!p) return;
      pendingEvals.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.type === 'eval-result') p.resolve(msg.result);
      else p.reject(new PoTokenError('eval', msg.message));
      break;
    }
    case 'minted':
    case 'mint-error': {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.type === 'minted') p.resolve(msg.tokens);
      else p.reject(new PoTokenError('mint', msg.message));
      break;
    }
  }
}

function waitForReady(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w.resolve !== done);
      reject(new PoTokenError('timeout', 'BotGuard did not finish in time'));
    }, READY_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    waiters.push({
      resolve: done,
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
  });
}

async function ensureReady(): Promise<PoTokenHost> {
  if (!host) throw new PoTokenError('webview', 'PO token WebView is not mounted');
  const h = host;
  if (state === 'ready' && Date.now() < expiresAt) return h;
  if (state !== 'loading') {
    // Expired or failed earlier: start over with a fresh page.
    state = 'loading';
    pageLoaded = false;
    h.reload();
  }
  await waitForReady();
  return h;
}

/** Mint one PO token per identifier (visitorData or a video id). */
export async function mintPoTokens(identifiers: string[]): Promise<string[]> {
  const h = await ensureReady();
  const id = nextId++;
  return new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new PoTokenError('mint', 'minting timed out'));
    }, MINT_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    h.run(`window.__soniqMint && window.__soniqMint(${id}, ${JSON.stringify(identifiers)}); true;`);
  });
}

function waitForPage(): Promise<void> {
  if (pageLoaded) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      loadWaiters = loadWaiters.filter((w) => w !== done);
      reject(new PoTokenError('webview', 'WebView page did not load in time'));
    }, PAGE_LOAD_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    loadWaiters.push(done);
  });
}

/**
 * Run a JS function body inside the WebView's browser engine and return its
 * (JSON-serializable) result. Does not need BotGuard to be ready.
 */
export async function runInWebView(code: string): Promise<unknown> {
  if (!host) throw new PoTokenError('webview', 'PO token WebView is not mounted');
  const h = host;
  await waitForPage();
  const id = nextId++;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingEvals.delete(id);
      reject(new PoTokenError('eval', 'WebView eval timed out'));
    }, EVAL_TIMEOUT_MS);
    pendingEvals.set(id, { resolve, reject, timer });
    h.run(`window.__soniqEval && window.__soniqEval(${id}, ${JSON.stringify(code)}); true;`);
  });
}

/** Last BotGuard failure, for diagnostics. */
export function getPoTokenError(): PoTokenError | null {
  return lastError;
}

/** Test-only. */
export function __resetPoTokenForTests(): void {
  host = null;
  state = 'loading';
  lastError = null;
  expiresAt = 0;
  waiters = [];
  nextId = 1;
  for (const p of pending.values()) clearTimeout(p.timer);
  pending.clear();
  pageLoaded = false;
  loadWaiters = [];
  for (const p of pendingEvals.values()) clearTimeout(p.timer);
  pendingEvals.clear();
}
