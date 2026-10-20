import { isTrackUnavailable } from '@/lib/errors';
import { MediaDownloadError } from '@/lib/mediaCache';
import { useSourceHealthStore } from '@/store/sourceHealthStore';
import { __resetYouTubeForTests, createYouTubeSource } from './youtube';

const mockSearch = jest.fn();
const mockGetBasicInfo = jest.fn();
const mockDownload = jest.fn();
const mockCached = jest.fn();

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

jest.mock('@/lib/fileKvCache', () => ({
  FileKvCache: class {
    cache_dir = 'test';
  },
}));

jest.mock('youtubei.js', () => ({
  Innertube: {
    create: jest.fn(async () => ({ search: mockSearch, getBasicInfo: mockGetBasicInfo })),
  },
  Constants: { CLIENTS: { VISIONOS: { USER_AGENT: 'vision-ua' } } },
}));

const track = {
  id: 'youtube:abcdefghijk',
  title: 'Safal',
  artist: 'Emiway',
  durationSec: 174,
  source: 'youtube' as const,
};

const info = (status = 'OK', reason = '') => ({
  playability_status: { status, reason },
  chooseFormat: () => ({
    itag: 140,
    mime_type: 'audio/mp4; codecs="mp4a.40.2"',
    content_length: 2_800_000,
    url: 'https://rr1.googlevideo.com/videoplayback?c=VISIONOS',
    decipher: async () => '',
  }),
});

/** Route-based fetch mock for the server fallback. */
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

beforeEach(() => {
  __resetYouTubeForTests();
  mockSearch.mockReset();
  mockGetBasicInfo.mockReset();
  mockDownload.mockReset().mockResolvedValue('file:///cache/youtube/abcdefghijk.m4a');
  mockCached.mockReset().mockReturnValue(null);
  useSourceHealthStore.setState({ bySource: {} });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('youtube source (on-device, VISIONOS)', () => {
  const source = createYouTubeSource();

  it('searches on-device and drops items without duration', async () => {
    mockSearch.mockResolvedValue({
      videos: [
        {
          video_id: 'abcdefghijk',
          title: { toString: () => 'Safal' },
          author: { name: 'Emiway Bantai' },
          duration: { seconds: 174 },
        },
        { video_id: 'live1234567', title: { toString: () => 'Live' }, duration: { seconds: 0 } },
      ],
    });
    const tracks = await source.search('safal', 10);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ id: 'youtube:abcdefghijk', artist: 'Emiway Bantai' });
  });

  it('resolves with the VISIONOS client and downloads with its User-Agent', async () => {
    mockGetBasicInfo.mockResolvedValue(info());
    await expect(source.getStreamUrl(track)).resolves.toBe('file:///cache/youtube/abcdefghijk.m4a');
    expect(mockGetBasicInfo).toHaveBeenCalledWith('abcdefghijk', { client: 'VISIONOS' });
    expect(mockDownload).toHaveBeenCalledWith(
      'https://rr1.googlevideo.com/videoplayback?c=VISIONOS',
      'youtube',
      'abcdefghijk.m4a',
      2_800_000,
      { headers: { 'User-Agent': 'vision-ua' } },
    );
  });

  it('plays from cache without asking YouTube', async () => {
    mockCached.mockReturnValue('file:///cache/youtube/abcdefghijk.m4a');
    await expect(source.getStreamUrl(track)).resolves.toBe('file:///cache/youtube/abcdefghijk.m4a');
    expect(mockGetBasicInfo).not.toHaveBeenCalled();
  });

  it('shares one download between two getStreamUrl calls', async () => {
    mockGetBasicInfo.mockResolvedValue(info());
    await Promise.all([source.getStreamUrl(track), source.getStreamUrl(track)]);
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('streams directly with the VISIONOS User-Agent and does not download', async () => {
    mockGetBasicInfo.mockResolvedValue(info());
    await expect(source.getPlaybackSource!(track)).resolves.toEqual({
      uri: 'https://rr1.googlevideo.com/videoplayback?c=VISIONOS',
      headers: { 'User-Agent': 'vision-ua' },
      canDownloadFallback: true,
    });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('prefetch only resolves the URL, then play reuses it', async () => {
    mockGetBasicInfo.mockResolvedValue(info());
    await source.prefetch!(track);
    await expect(source.getPlaybackSource!(track)).resolves.toMatchObject({
      uri: 'https://rr1.googlevideo.com/videoplayback?c=VISIONOS',
    });
    expect(mockGetBasicInfo).toHaveBeenCalledTimes(1);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('marks removed videos unavailable', async () => {
    mockGetBasicInfo.mockResolvedValue(info('ERROR', 'Video unavailable'));
    const err = await source.getStreamUrl(track).catch((e: unknown) => e);
    expect(isTrackUnavailable(err)).toBe(true);
  });

  it('marks removed videos unavailable before streaming too', async () => {
    mockGetBasicInfo.mockResolvedValue(info('ERROR', 'Video unavailable'));
    const err = await source.getPlaybackSource!(track).catch((e: unknown) => e);
    expect(isTrackUnavailable(err)).toBe(true);
  });

  it('records a 403 for Settings when there is no server', async () => {
    mockGetBasicInfo.mockResolvedValue(info());
    mockDownload.mockRejectedValue(new MediaDownloadError('status: 403', 403));
    await expect(source.getStreamUrl(track)).rejects.toBeDefined();
    expect(useSourceHealthStore.getState().bySource.youtube).toMatchObject({
      ok: false,
      stage: 'http-403',
    });
  });
});

describe('youtube source (server fallback)', () => {
  const source = createYouTubeSource({ serverUrl: 'http://127.0.0.1:3000/', serverKey: 'k' });

  it('falls back to the server stream when on-device fails', async () => {
    mockGetBasicInfo.mockRejectedValue(new Error('YouTube changed'));
    mockServer({ '/resolve': [200, { id: 'abcdefghijk' }] });
    await expect(source.getStreamUrl(track)).resolves.toBe(
      'http://127.0.0.1:3000/stream?id=abcdefghijk&key=k',
    );
  });

  it('falls back to the server stream when the direct URL cannot be resolved', async () => {
    mockGetBasicInfo.mockRejectedValue(new Error('YouTube changed'));
    mockServer({ '/resolve': [200, { id: 'abcdefghijk' }] });
    await expect(source.getPlaybackSource!(track)).resolves.toEqual({
      uri: 'http://127.0.0.1:3000/stream?id=abcdefghijk&key=k',
    });
  });

  it('falls back to server search when on-device search fails', async () => {
    mockSearch.mockRejectedValue(new Error('parser broke'));
    mockServer({
      '/search': [200, { results: [{ id: 'abcdefghijk', title: 'Safal', artist: 'E', durationSec: 1 }] }],
    });
    await expect(source.search('safal')).resolves.toMatchObject([{ id: 'youtube:abcdefghijk' }]);
  });
});
