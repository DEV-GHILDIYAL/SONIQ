import { mockFetch } from '@/test/mockFetch';
import { buildUrl, fetchJson, HttpError } from './fetch';

describe('fetchJson', () => {
  it('returns parsed JSON', async () => {
    mockFetch([['example.test', { ok: 1 }]]);
    await expect(fetchJson('https://example.test/a')).resolves.toEqual({ ok: 1 });
  });

  it('throws HttpError on non-2xx', async () => {
    mockFetch([]);
    await expect(fetchJson('https://example.test/missing')).rejects.toBeInstanceOf(HttpError);
  });

  it('wraps network failures in a readable error', async () => {
    mockFetch([['example.test', new TypeError('Network request failed')]]);
    await expect(fetchJson('https://example.test/a')).rejects.toThrow(/Network error/);
  });
});

describe('buildUrl', () => {
  it('encodes params and skips undefined', () => {
    expect(buildUrl('https://x.test/', { q: 'a b', n: 2, skip: undefined })).toBe(
      'https://x.test/?q=a%20b&n=2',
    );
  });
});
