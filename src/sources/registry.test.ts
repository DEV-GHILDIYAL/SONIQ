import { useSearchCacheStore } from '@/store/searchCacheStore';
import { makeTrack } from '@/test/fixtures';
import { createRegistry, searchCacheKey } from './registry';
import type { MusicSource, Track } from './types';

const source = (id: MusicSource['id'], search: MusicSource['search']): MusicSource => ({
  id,
  label: id,
  search,
  getStreamUrl: jest.fn(async (t: Track) => `https://stream/${t.id}`),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createRegistry', () => {
  beforeEach(() => useSearchCacheStore.setState({ items: {} }));

  it('interleaves results from all sources', async () => {
    const a = source('jamendo', async () => [makeTrack(1), makeTrack(2)]);
    const b = source('archive', async () => [makeTrack(3, { id: 'archive:3', source: 'archive' })]);
    const reg = createRegistry([a, b]);
    const ids = (await reg.searchAll('x')).map((t) => t.id);
    expect(ids).toEqual(['jamendo:1', 'archive:3', 'jamendo:2']);
  });

  it('only queries the requested sources', async () => {
    const a = source(
      'jamendo',
      jest.fn(async () => [makeTrack(1)]),
    );
    const b = source(
      'archive',
      jest.fn(async () => []),
    );
    await createRegistry([a, b]).searchAll('x', ['archive']);
    expect(a.search).not.toHaveBeenCalled();
    expect(b.search).toHaveBeenCalledWith('x', 20, undefined);
  });

  it('returns [] for a blank query without calling sources', async () => {
    const a = source(
      'jamendo',
      jest.fn(async () => [makeTrack(1)]),
    );
    expect(await createRegistry([a]).searchAll('   ')).toEqual([]);
    expect(a.search).not.toHaveBeenCalled();
  });

  it('keeps partial results when one source fails', async () => {
    const a = source('jamendo', async () => [makeTrack(1)]);
    const b = source('archive', async () => {
      throw new Error('down');
    });
    expect(await createRegistry([a, b]).searchAll('x')).toHaveLength(1);
  });

  it('throws when every source fails', async () => {
    const a = source('jamendo', async () => {
      throw new Error('network down');
    });
    await expect(createRegistry([a]).searchAll('x')).rejects.toThrow('network down');
  });

  it('emits the fast source before the slow source', async () => {
    const fast = deferred<Track[]>();
    const slow = deferred<Track[]>();
    const a = source(
      'jamendo',
      jest.fn(() => fast.promise),
    );
    const b = source(
      'archive',
      jest.fn(() => slow.promise),
    );
    const batches: Track[][] = [];
    const done = createRegistry([a, b]).searchAllWithBatches('x', undefined, 20, (batch) => {
      batches.push(batch.tracks);
    });

    fast.resolve([makeTrack(1)]);
    await Promise.resolve();
    expect(batches[0]?.map((t) => t.id)).toEqual(['jamendo:1']);

    slow.resolve([makeTrack(2, { id: 'archive:2', source: 'archive' })]);
    expect((await done).map((t) => t.id)).toEqual(['jamendo:1', 'archive:2']);
    expect(batches[1]?.map((t) => t.id)).toEqual(['archive:2']);
  });

  it('does not emit results after the request is aborted', async () => {
    const controller = new AbortController();
    const batches: Track[][] = [];
    const a = source('jamendo', async () => [makeTrack(1)]);
    const done = createRegistry([a]).searchAllWithBatches(
      'x',
      undefined,
      20,
      (batch) => {
        batches.push(batch.tracks);
      },
      controller.signal,
    );

    controller.abort();
    await expect(done).rejects.toThrow('Search aborted');
    expect(batches).toEqual([]);
  });

  it('shares an in-flight search and saves complete answers', async () => {
    const pending = deferred<Track[]>();
    const search = jest.fn(() => pending.promise);
    const reg = createRegistry([source('jamendo', search)]);
    const first = reg.searchAll('x');
    const second = reg.searchAll('x');

    pending.resolve([makeTrack(1)]);
    expect(await first).toHaveLength(1);
    expect(await second).toHaveLength(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(useSearchCacheStore.getState().items[searchCacheKey('x', ['jamendo'])]).toBeDefined();
  });

  it('resolves stream urls via the track source, and errors for unknown sources', async () => {
    const reg = createRegistry([source('jamendo', async () => [])]);
    await expect(reg.getStreamUrl(makeTrack(1))).resolves.toBe('https://stream/jamendo:1');
    await expect(reg.getStreamUrl(makeTrack(2, { id: 'fma:2', source: 'fma' }))).rejects.toThrow(
      'not available',
    );
  });

  it('prefers a direct-stream resolver, and falls back to getStreamUrl for downloads', async () => {
    const jam = source('jamendo', async () => []);
    jam.getPlaybackSource = jest.fn(async () => ({
      uri: 'https://direct/jamendo:1',
      headers: { 'User-Agent': 'ua' },
      canDownloadFallback: true,
    }));
    const reg = createRegistry([jam]);

    await expect(reg.getPlaybackSource(makeTrack(1))).resolves.toEqual({
      uri: 'https://direct/jamendo:1',
      headers: { 'User-Agent': 'ua' },
      canDownloadFallback: true,
    });
    await expect(reg.getPlaybackSource(makeTrack(1), { preferDownload: true })).resolves.toEqual({
      uri: 'https://stream/jamendo:1',
    });
  });
});
