import { useLocalLibraryStore } from '@/store/localLibraryStore';
import { importLocalFiles, localSource, titleFromFileName } from './local';

const mockGetDocument = jest.fn();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocument(...args),
}));

const mockCopy = jest.fn(() => Promise.resolve());
const mockExists = { value: true };
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
        .join('/');
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
        .join('/');
    }
    copy(...args: unknown[]) {
      return mockCopy(...(args as []));
    }
    get exists() {
      return mockExists.value;
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs' } } };
});

beforeEach(() => {
  useLocalLibraryStore.setState({ files: [] });
  mockGetDocument.mockReset();
  mockCopy.mockClear();
  mockExists.value = true;
});

describe('local source', () => {
  it('imports picked files into the document directory', async () => {
    mockGetDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/My_Song.mp3', name: 'My_Song.mp3' }],
    });
    await expect(importLocalFiles()).resolves.toBe(1);
    const [file] = useLocalLibraryStore.getState().files;
    expect(file?.title).toBe('My Song');
    expect(file?.uri).toMatch(/^file:\/\/\/docs\/music\/.+My_Song\.mp3$/);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when the picker is cancelled', async () => {
    mockGetDocument.mockResolvedValue({ canceled: true, assets: null });
    await expect(importLocalFiles()).resolves.toBe(0);
  });

  it('searches imported files by title', async () => {
    useLocalLibraryStore.setState({
      files: [
        { id: 'a', title: 'Monsoon Letters', uri: 'file:///docs/music/a.mp3', addedAt: 1 },
        { id: 'b', title: 'Low Tide', uri: 'file:///docs/music/b.mp3', addedAt: 2 },
      ],
    });
    const tracks = await localSource.search('tide');
    expect(tracks.map((t) => t.id)).toEqual(['local:b']);
  });

  it('resolves stream urls and errors for missing files', async () => {
    useLocalLibraryStore.setState({
      files: [{ id: 'a', title: 'A', uri: 'file:///docs/music/a.mp3', addedAt: 1 }],
    });
    const track = {
      id: 'local:a',
      title: 'A',
      artist: '',
      durationSec: 0,
      source: 'local' as const,
    };
    await expect(localSource.getStreamUrl(track)).resolves.toBe('file:///docs/music/a.mp3');
    mockExists.value = false;
    await expect(localSource.getStreamUrl(track)).rejects.toThrow('not found');
  });

  it('derives titles from file names', () => {
    expect(titleFromFileName('01_-_Intro.flac')).toBe('01 - Intro');
    expect(titleFromFileName('.mp3')).toBe('Untitled');
  });
});
