import type { Track } from '@/sources/types';
import { useLikedStore } from './likedStore';

const t = (n: number): Track => ({
  id: `jamendo:${n}`,
  title: `Song ${n}`,
  artist: 'X',
  durationSec: 100,
  source: 'jamendo',
});

beforeEach(() => useLikedStore.setState({ tracks: [] }));

describe('liked store', () => {
  it('likes newest first and unlikes on second toggle', () => {
    const { toggle } = useLikedStore.getState();
    expect(toggle(t(1))).toBe(true);
    expect(toggle(t(2))).toBe(true);
    expect(useLikedStore.getState().tracks.map((x) => x.id)).toEqual(['jamendo:2', 'jamendo:1']);
    expect(toggle(t(1))).toBe(false);
    expect(useLikedStore.getState().tracks.map((x) => x.id)).toEqual(['jamendo:2']);
  });

  it('never stores duplicates and removes by id', () => {
    const { toggle, remove } = useLikedStore.getState();
    toggle(t(1));
    toggle(t(1));
    toggle(t(1));
    expect(useLikedStore.getState().tracks).toHaveLength(1);
    remove('jamendo:1');
    expect(useLikedStore.getState().tracks).toHaveLength(0);
  });
});
