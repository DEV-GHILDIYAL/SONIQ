import { makeUserId, MAX_HISTORY, topEntries, useProfileStore } from './profileStore';
import type { Track } from '@/sources/types';

const t = (n: number, artist = 'Arijit Singh'): Track => ({
  id: `youtube:${n}`,
  title: `Song ${n}`,
  artist,
  durationSec: 200,
  source: 'youtube',
});

beforeEach(() =>
  useProfileStore.setState({
    profile: null,
    plays: 0,
    artistCounts: {},
    sourceCounts: {},
    genreCounts: {},
    history: [],
  }),
);

describe('profile store', () => {
  it('creates a profile with a readable unique id, and keeps the id on rename', () => {
    const p = useProfileStore.getState().createProfile('  Dev   G ');
    expect(p.name).toBe('Dev G');
    expect(p.id).toMatch(/^SQ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    useProfileStore.getState().rename('Dev');
    expect(useProfileStore.getState().profile).toMatchObject({ id: p.id, name: 'Dev' });
  });

  it('generates different ids', () => {
    expect(new Set(Array.from({ length: 50 }, () => makeUserId())).size).toBe(50);
  });

  it('counts plays per artist and source, with a bounded history', () => {
    const { recordPlay } = useProfileStore.getState();
    for (let i = 0; i < MAX_HISTORY + 5; i++) recordPlay(t(i, i % 3 === 0 ? 'Emiway' : 'Arijit Singh'));
    const s = useProfileStore.getState();
    expect(s.plays).toBe(MAX_HISTORY + 5);
    expect(s.history).toHaveLength(MAX_HISTORY);
    expect(topEntries(s.artistCounts, 1)[0]?.[0]).toBe('Arijit Singh');
    expect(s.sourceCounts.youtube).toBe(MAX_HISTORY + 5);
  });

  it('ranks genres', () => {
    const { recordGenre } = useProfileStore.getState();
    recordGenre('Lo-fi');
    recordGenre('Hip-hop');
    recordGenre('Lo-fi');
    expect(topEntries(useProfileStore.getState().genreCounts, 2)).toEqual([
      ['Lo-fi', 2],
      ['Hip-hop', 1],
    ]);
  });
});
