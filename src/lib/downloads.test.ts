import type { Track } from '@/sources/types';
import { useDownloadStore } from '@/store/downloadStore';
import {
  __resetDownloadsForTests,
  downloadTrack,
  downloadTracks,
  formatBytes,
  removeDownload,
  resolveStream,
  saveToPhone,
} from './downloads';

const mockStream = jest.fn();
const mockPlayback = jest.fn();
const mockSave = jest.fn();
const mockDelete = jest.fn();
const mockExists = jest.fn();
const mockPick = jest.fn();
const mockCopy = jest.fn();

jest.mock('@/sources/registry', () => ({
  getStreamUrl: (...a: unknown[]) => mockStream(...a),
  getPlaybackSource: (...a: unknown[]) => mockPlayback(...a),
}));
jest.mock('./downloadFiles', () => ({
  saveSongFile: (...a: unknown[]) => mockSave(...a),
  deleteSongFile: (...a: unknown[]) => mockDelete(...a),
  songFileExists: (...a: unknown[]) => mockExists(...a),
  pickPhoneFolder: (...a: unknown[]) => mockPick(...a),
  copySongToFolder: (...a: unknown[]) => mockCopy(...a),
}));

const t = (n: number, source: Track['source'] = 'youtube'): Track => ({
  id: `${source}:${n}`,
  title: `Song ${n}`,
  artist: 'X',
  durationSec: 100,
  source,
});
const idle = () =>
  new Promise<void>((resolve) => {
    const check = () =>
      useDownloadStore.getState().pending.length === 0 ? resolve() : setTimeout(check, 0);
    check();
  });

beforeEach(() => {
  __resetDownloadsForTests();
  useDownloadStore.setState({ items: {}, pending: [], active: null, failed: {}, phoneFolder: null });
  mockPick.mockReset().mockResolvedValue({ uri: 'content://tree/Music', name: 'Music' });
  mockCopy.mockReset().mockImplementation(async (_f: string, _d: string, base: string) => `${base}.m4a`);
  mockStream.mockReset().mockImplementation(async (tr: Track) => `file:///cache/${tr.id}.m4a`);
  mockPlayback
    .mockReset()
    .mockImplementation(async (tr: Track) => ({ uri: `file:///cache/${tr.id}.m4a` }));
  mockSave.mockReset().mockImplementation(async (_src: string, name: string) => ({
    uri: `file:///docs/downloads/${name}`,
    bytes: 4_000_000,
  }));
  mockDelete.mockReset();
  mockExists.mockReset().mockReturnValue(true);
});

describe('downloads', () => {
  it('downloads one at a time and keeps the file extension', async () => {
    downloadTracks([t(1), t(2)]);
    expect(useDownloadStore.getState().pending).toHaveLength(2);
    await idle();
    expect(mockSave.mock.calls.map((c) => c[1])).toEqual(['youtube_1.m4a', 'youtube_2.m4a']);
    expect(Object.keys(useDownloadStore.getState().items)).toEqual(['youtube:1', 'youtube:2']);
    expect(useDownloadStore.getState().active).toBeNull();
  });

  it('skips local files, duplicates and finished downloads', async () => {
    expect(downloadTrack(t(1, 'local'))).toBe(false);
    expect(downloadTracks([t(1), t(1)])).toBe(1);
    await idle();
    expect(downloadTrack(t(1))).toBe(false);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('plays a downloaded song from the phone, without asking the source', async () => {
    downloadTrack(t(1));
    await idle();
    mockStream.mockClear();
    await expect(resolveStream(t(1))).resolves.toEqual({ uri: 'file:///docs/downloads/youtube_1.m4a' });
    expect(mockPlayback).not.toHaveBeenCalled();
    await expect(resolveStream(t(2))).resolves.toEqual({ uri: 'file:///cache/youtube:2.m4a' });
  });

  it('forgets a download whose file was deleted outside the app', async () => {
    downloadTrack(t(1));
    await idle();
    mockExists.mockReturnValue(false);
    await resolveStream(t(1));
    expect(useDownloadStore.getState().items['youtube:1']).toBeUndefined();
  });

  it('records failures and keeps going', async () => {
    mockStream.mockRejectedValueOnce(new Error('offline'));
    downloadTracks([t(1), t(2)]);
    await idle();
    expect(useDownloadStore.getState().failed['youtube:1']).toBe('offline');
    expect(useDownloadStore.getState().items['youtube:2']).toBeDefined();
  });

  it('removes the file on delete', async () => {
    downloadTrack(t(1));
    await idle();
    removeDownload('youtube:1');
    expect(mockDelete).toHaveBeenCalledWith('file:///docs/downloads/youtube_1.m4a');
    expect(useDownloadStore.getState().items).toEqual({});
  });

  it('save to phone: asks for a folder once, downloads first, names the file nicely', async () => {
    const song = { ...t(1), artist: 'Arijit Singh', title: 'Kesariya / Love' };
    await expect(saveToPhone(song)).resolves.toBe('Music/Arijit Singh - Kesariya Love.m4a');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockCopy).toHaveBeenCalledWith(
      'file:///docs/downloads/youtube_1.m4a',
      'content://tree/Music',
      'Arijit Singh - Kesariya Love',
    );
    await saveToPhone(song);
    expect(mockPick).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('save to phone forgets a folder that stopped working', async () => {
    mockCopy.mockRejectedValueOnce(new Error('permission denied'));
    await expect(saveToPhone(t(1))).rejects.toThrow('permission denied');
    expect(useDownloadStore.getState().phoneFolder).toBeNull();
  });

  it('formats sizes', () => {
    expect(formatBytes(4_000_000)).toBe('4 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB');
  });
});
