import { isTrackUnavailable } from '@/lib/errors';
import { MediaDownloadError } from '@/lib/mediaCache';
import { useSourceHealthStore } from '@/store/sourceHealthStore';
import { __resetYouTubeForTests, youtubeSource, YouTubeError } from './youtube';

const mockSearch = jest.fn();
const mockGetBasicInfo = jest.fn();
const mockDownload = jest.fn();
const mockCached = jest.fn();
const mockMint = jest.fn();
const mockSession: { po_token?: string; player: { po_token?: string }; context: object } = {
  player: {},
  context: { client: { visitorData: 'VISITOR' } },
};

jest.mock('@/lib/mediaCache', () => ({
  downloadMedia: (...args: unknown[]) => mockDownload(...args),
  getCachedMedia: (...args: unknown[]) => mockCached(...args),
  MediaDownloadError: class extends Error {
    status?: number;
    constructor(message: string, httpStatus?: number) {
      super(message);
      this.status = httpStatus;
    }
  },
}));

jest.mock('@/lib/poToken', () => ({
  mintPoTokens: (...args: unknown[]) => mockMint(...args),
}));

jest.mock('@/lib/fileKvCache', () => ({
  FileKvCache: class {
    cache_dir = 'test';
  },
}));

jest.mock('youtubei.js', () => ({
  Innertube: {
    create: jest.fn(async () => ({
      search: mockSearch,
      getBasicInfo: mockGetBasicInfo,
      session: mockSession,
    })),
  },
  Platform: { shim: {} },
  Constants: { CLIENTS: { ANDROID_VR: { USER_AGENT: 'vr-agent' } } },
}));

const track = {
  id: 'youtube:abc',
  title: 'Song',
  artist: 'X',
  durationSec: 1,
  source: 'youtube' as const,
};

/** Fake getBasicInfo result. */
const info = (status: string, url = 'https://rr1.googlevideo.com/audio?pot=S', reason = '') => ({
  playability_status: { status, reason },
  streaming_data: { adaptive_formats: [] },
  chooseFormat: () => ({
    itag: 140,
    mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    bitrate: 130000,
    content_length: 4_000_000,
    decipher: async () => url,
  }),
});

const downloadOk = () =>
  mockDownload.mockImplementation(async (url: string) => `file:///cache/${url.split('/').pop()}`);
const http = (status: number) => new MediaDownloadError(`status: ${status}`, status);
const clientsAsked = () => mockGetBasicInfo.mock.calls.map((c) => c[1].client);

beforeEach(() => {
  __resetYouTubeForTests();
  mockSearch.mockReset();
  mockGetBasicInfo.mockReset();
  mockDownload.mockReset();
  mockCached.mockReset().mockReturnValue(null);
  mockMint.mockReset().mockImplementation(async (ids: string[]) => ids.map((id) => `pot-${id}`));
  mockSession.po_token = undefined;
  mockSession.player = {};
  // Diagnostics probe with fetch after a failed download; never hit the network.
  globalThis.fetch = jest.fn(async () => ({ status: 403 }) as Response) as unknown as typeof fetch;
  useSourceHealthStore.setState({ bySource: {} });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('youtube source', () => {
  it('maps search results to tracks', async () => {
    mockSearch.mockResolvedValue({
      results: [{ type: 'Video' }],
      videos: [
        {
          video_id: 'abc',
          title: { toString: () => 'Kesariya' },
          author: { name: 'Arijit' },
          duration: { seconds: 268 },
          best_thumbnail: { url: 'https://i.ytimg.com/abc.jpg' },
        },
        { video_id: '', title: { toString: () => 'broken' } },
      ],
    });
    await expect(youtubeSource.search('kesariya', 10)).resolves.toEqual([
      {
        id: 'youtube:abc',
        title: 'Kesariya',
        artist: 'Arijit',
        durationSec: 268,
        artworkUrl: 'https://i.ytimg.com/abc.jpg',
        source: 'youtube',
      },
    ]);
  });

  it('reports a "search" break when results exist but none parse', async () => {
    mockSearch.mockResolvedValue({ results: [{ type: 'NewWeirdNode' }], videos: [] });
    await expect(youtubeSource.search('x')).rejects.toMatchObject({ stage: 'search' });
    expect(useSourceHealthStore.getState().bySource.youtube).toMatchObject({
      ok: false,
      stage: 'search',
    });
  });

  it('mints a PO token for the session visitorData and puts it on the session + player', async () => {
    downloadOk();
    mockGetBasicInfo.mockResolvedValue(info('OK'));
    await youtubeSource.getStreamUrl(track);
    expect(mockMint).toHaveBeenCalledWith(['VISITOR']);
    expect(mockSession.po_token).toBe('pot-VISITOR');
    expect(mockSession.player.po_token).toBe('pot-VISITOR');
    expect(clientsAsked()).toEqual(['MWEB']);
  });

  it('retries with a video-bound PO token when the session token gets 403', async () => {
    mockGetBasicInfo.mockResolvedValue(info('OK'));
    mockDownload
      .mockRejectedValueOnce(http(403))
      .mockImplementationOnce(async (url: string) => `file:///cache/from?${url.split('?')[1]}`);
    await expect(youtubeSource.getStreamUrl(track)).resolves.toBe('file:///cache/from?pot=pot-abc');
    expect(mockMint).toHaveBeenLastCalledWith(['abc']);
  });

  it('falls through to the next client when one is blocked', async () => {
    downloadOk();
    mockGetBasicInfo
      .mockResolvedValueOnce(info('LOGIN_REQUIRED', '', "Sign in to confirm you're not a bot"))
      .mockResolvedValueOnce(info('OK', 'https://rr1.googlevideo.com/ok'));
    await expect(youtubeSource.getStreamUrl(track)).resolves.toBe('file:///cache/ok');
    expect(clientsAsked()).toEqual(['MWEB', 'WEB']);
  });

  it('sends the client User-Agent with app-client downloads', async () => {
    downloadOk();
    mockGetBasicInfo
      .mockResolvedValueOnce(info('LOGIN_REQUIRED'))
      .mockResolvedValueOnce(info('LOGIN_REQUIRED'))
      .mockResolvedValueOnce(info('OK', 'https://rr1.googlevideo.com/vr'));
    await youtubeSource.getStreamUrl(track);
    expect(mockDownload).toHaveBeenCalledWith(
      'https://rr1.googlevideo.com/vr',
      'youtube',
      'abc.m4a',
      4_000_000,
      { headers: { 'User-Agent': 'vr-agent' } },
    );
  });

  it('plays from cache without asking YouTube', async () => {
    mockCached.mockReturnValue('file:///cache/abc.m4a');
    await expect(youtubeSource.getStreamUrl(track)).resolves.toBe('file:///cache/abc.m4a');
    expect(mockGetBasicInfo).not.toHaveBeenCalled();
  });

  it('shares one download between playback and prefetch', async () => {
    let release: (v: string) => void = () => {};
    mockDownload.mockImplementation(() => new Promise<string>((r) => (release = r)));
    mockGetBasicInfo.mockResolvedValue(info('OK'));
    const prefetch = youtubeSource.prefetch!(track);
    const play = youtubeSource.getStreamUrl(track);
    await new Promise((r) => setTimeout(r, 0));
    release('file:///cache/abc.m4a');
    await expect(play).resolves.toBe('file:///cache/abc.m4a');
    await prefetch;
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('tags a "stream" break when every client URL is rejected, after one session retry', async () => {
    mockDownload.mockRejectedValue(http(403));
    mockGetBasicInfo.mockResolvedValue(info('OK'));
    const err = await youtubeSource.getStreamUrl(track).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(YouTubeError);
    expect(err).toMatchObject({ stage: 'stream' });
    expect(mockGetBasicInfo).toHaveBeenCalledTimes(8); // 4 clients x (first try + retry)
    expect(useSourceHealthStore.getState().bySource.youtube).toMatchObject({
      ok: false,
      stage: 'stream',
    });
  });

  it('blames the PO token when BotGuard failed and streams get 403', async () => {
    mockMint.mockRejectedValue(new Error('BotGuard vm: VM unavailable'));
    mockDownload.mockRejectedValue(http(403));
    mockGetBasicInfo.mockResolvedValue(info('OK'));
    const err = await youtubeSource.getStreamUrl(track).catch((e: unknown) => e);
    expect(err).toMatchObject({ stage: 'potoken' });
    expect((err as YouTubeError).details[0]).toContain('PO token: Error: BotGuard vm');
  });

  it('marks the track unavailable only when every client says the video is gone', async () => {
    mockGetBasicInfo.mockResolvedValue(info('ERROR', '', 'Video unavailable'));
    const err = await youtubeSource.getStreamUrl(track).catch((e: unknown) => e);
    expect(isTrackUnavailable(err)).toBe(true);
  });

  it('treats network failures as offline, not as a YouTube break', async () => {
    mockGetBasicInfo.mockRejectedValue(new TypeError('Network request failed'));
    await expect(youtubeSource.getStreamUrl(track)).rejects.toMatchObject({ stage: 'network' });
    expect(useSourceHealthStore.getState().bySource.youtube).toBeUndefined();
  });

  it('self-test reports each step and bypasses the cache', async () => {
    downloadOk();
    mockCached.mockReturnValue('file:///cache/old.m4a');
    mockSearch.mockResolvedValue({
      results: [{ type: 'Video' }],
      videos: [{ video_id: 'z', title: { toString: () => 'Lofi' } }],
    });
    mockGetBasicInfo.mockResolvedValue(info('OK'));
    const health = await youtubeSource.checkHealth!();
    expect(health).toMatchObject({ ok: true });
    expect(health.details).toEqual([
      'Session: OK',
      'PO token: OK',
      'Search: OK (1 results)',
      'Stream: OK',
    ]);
    expect(mockDownload).toHaveBeenCalled();
  });
});
