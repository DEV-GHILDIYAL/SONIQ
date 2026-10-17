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
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 12_000;

/** GET a URL and parse JSON. Throws HttpError on non-2xx, Error on timeout / network failure. */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
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
