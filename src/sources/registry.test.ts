import { makeTrack } from '@/test/fixtures';
import { createRegistry } from './registry';
import type { MusicSource, Track } from './types';

const source = (id: MusicSource['id'], search: MusicSource['search']): MusicSource => ({
  id,
  label: id,
  search,
  getStreamUrl: jest.fn(async (t: Track) => `https://stream/${t.id}`),
});

describe('createRegistry', () => {
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
    expect(b.search).toHaveBeenCalledWith('x', 20);
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

  it('resolves stream urls via the track source, and errors for unknown sources', async () => {
    const reg = createRegistry([source('jamendo', async () => [])]);
    await expect(reg.getStreamUrl(makeTrack(1))).resolves.toBe('https://stream/jamendo:1');
    await expect(reg.getStreamUrl(makeTrack(2, { id: 'fma:2', source: 'fma' }))).rejects.toThrow(
      'not available',
    );
  });
});
