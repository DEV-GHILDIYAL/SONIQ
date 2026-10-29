/** Every network call in the app goes through here (timeouts + readable errors). */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Request failed (${status})`);
    this.name = 'HttpError';
  }
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 12_000;

/** Fetch a URL and parse JSON. Throws HttpError on non-2xx, Error on timeout / network failure. */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  try {
    let res: Response;
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(options.headers ?? {}),
      };
      let body: string | undefined;
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }
      res = await fetch(url, {
        method: options.method ?? 'GET',
        signal: controller.signal,
        headers,
        body,
      });
    } catch (err) {
      if (controller.signal.aborted && !options.signal?.aborted) {
        throw new Error('Request timed out. Check your connection.');
      }
      throw new Error(
        `Network error: ${err instanceof Error ? err.message : String(err)}. Check your connection.`,
      );
    }
    if (!res.ok) throw new HttpError(res.status, url);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** Status of a GET with the given headers (body discarded). 0 on network error / timeout. */
export async function fetchStatus(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timeout);
  }
}

export interface BytesRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/**
 * Fetch raw bytes. Returns the HTTP status and, on 2xx, the body.
 * Status 0 = network error / timeout.
 */
export async function fetchBytes(
  url: string,
  req: BytesRequest = {},
): Promise<{ status: number; bytes?: Uint8Array }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method: req.method ?? 'GET',
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) return { status: res.status };
    return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

/** Build a URL with query params, skipping undefined values. */
export function buildUrl(
  base: string,
  params: Record<string, string | number | undefined>,
): string {
  const qs = Object.entries(params)
    .filter((e): e is [string, string | number] => e[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${base}?${qs}` : base;
}
