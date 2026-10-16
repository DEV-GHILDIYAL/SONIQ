import { makeTrack } from '@/test/fixtures';
import { MAX_RECENT, useRecentStore } from './recentStore';

const store = () => useRecentStore.getState();

beforeEach(() => store().clear());

describe('recentStore', () => {
  it('adds newest first and moves repeats to the front', () => {
    store().add(makeTrack(1));
    store().add(makeTrack(2));
    store().add(makeTrack(1));
    expect(store().tracks.map((t) => t.id)).toEqual(['jamendo:1', 'jamendo:2']);
  });

  it(`keeps at most ${MAX_RECENT} tracks`, () => {
    for (let i = 0; i < MAX_RECENT + 5; i++) store().add(makeTrack(i));
    expect(store().tracks).toHaveLength(MAX_RECENT);
    expect(store().tracks[0]?.id).toBe(`jamendo:${MAX_RECENT + 4}`);
  });
});
