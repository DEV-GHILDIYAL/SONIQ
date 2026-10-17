import { isTrackUnavailable } from '@/lib/errors';
import { useSourceHealthStore } from '@/store/sourceHealthStore';
import { createYouTubeSource } from './youtube';

const source = createYouTubeSource('https://soniq.example.com/', 'secret');

const track = {
  id: 'youtube:abcdefghijk',
  title: 'Safal',
  artist: 'Emiway',
  durationSec: 200,
  source: 'youtube' as const,
};

/** Route-based fetch mock returning a status + JSON body. */
function mockServer(routes: Record<string, [number, unknown]>) {
  const fn = jest.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([path]) => url.includes(path));
    const [status, body] = hit?.[1] ?? [404, {}];
    return { ok: status < 300, status, json: async () => body } as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => useSourceHealthStore.setState({ bySource: {} }));

describe('youtube source (SONIQ server)', () => {
  it('searches through the server and maps tracks', async () => {
    const fetch = mockServer({
      '/search': [
        200,
        { results: [{ id: 'abcdefghijk', title: 'Safal', artist: 'Emiway', durationSec: 200 }] },
      ],
    });
    await expect(source.search('safal', 5)).resolves.toEqual([
      {
        id: 'youtube:abcdefghijk',
        title: 'Safal',
        artist: 'Emiway',
        durationSec: 200,
        artworkUrl: undefined,
        source: 'youtube',
      },
    ]);
    const url = String(fetch.mock.calls[0]?.[0]);
    expect(url).toContain('https://soniq.example.com/search?');
    expect(url).toContain('q=safal');
    expect(url).toContain('key=secret');
  });

  it('resolves first, then returns the proxied stream URL', async () => {
    const fetch = mockServer({ '/resolve': [200, { id: 'abcdefghijk' }] });
    await expect(source.getStreamUrl(track)).resolves.toBe(
      'https://soniq.example.com/stream?id=abcdefghijk&key=secret',
    );
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/resolve?id=abcdefghijk');
  });

  it('marks removed videos unavailable (404)', async () => {
    mockServer({ '/resolve': [404, { error: 'Video unavailable' }] });
    const err = await source.getStreamUrl(track).catch((e: unknown) => e);
    expect(isTrackUnavailable(err)).toBe(true);
  });

  it('explains server-side blocks and records them for Settings', async () => {
    mockServer({ '/resolve': [429, { error: 'Sign in to confirm' }] });
    await expect(source.getStreamUrl(track)).rejects.toThrow(/blocking the server/);
    expect(useSourceHealthStore.getState().bySource.youtube).toMatchObject({
      ok: false,
      stage: 'http-429',
    });
  });

  it('self-test checks server, search and stream', async () => {
    mockServer({
      '/health': [200, { ok: true, ytdlp: '2026.10.01' }],
      '/search': [200, { results: [{ id: 'abcdefghijk', title: 'x', artist: 'y', durationSec: 1 }] }],
      '/resolve': [200, { id: 'abcdefghijk' }],
    });
    const health = await source.checkHealth!();
    expect(health).toMatchObject({ ok: true });
    expect(health.details).toEqual([
      'Server: OK (yt-dlp 2026.10.01)',
      'Search: OK (1 results)',
      'Stream: OK',
    ]);
  });
});
