import type { Track } from '@/sources/types';
import {
  MAX_RECENT_SEARCHES,
  recentKey,
  recentQueries,
  suggestionsFor,
  useSearchHistoryStore,
} from './searchHistoryStore';

const t = (n: number): Track => ({
  id: `youtube:${n}`,
  title: `Song ${n}`,
  artist: 'X',
  durationSec: 100,
  source: 'youtube',
});
const keys = () => useSearchHistoryStore.getState().items.map(recentKey);

beforeEach(() => useSearchHistoryStore.setState({ items: [] }));

describe('recent searches', () => {
  it('mixes typed searches and played songs, newest first, without duplicates', () => {
    const { add, addTrack } = useSearchHistoryStore.getState();
    add('  arijit   singh ');
    addTrack(t(1));
    add('Arijit Singh');
    addTrack(t(1));
    add('a');
    expect(keys()).toEqual(['t:youtube:1', 'q:arijit singh']);
    expect(recentQueries(useSearchHistoryStore.getState().items)).toEqual(['Arijit Singh']);
  });

  it('keeps the last 20', () => {
    const { addTrack } = useSearchHistoryStore.getState();
    for (let i = 0; i < MAX_RECENT_SEARCHES + 5; i++) addTrack(t(i));
    expect(keys()).toHaveLength(MAX_RECENT_SEARCHES);
    expect(keys()[0]).toBe(`t:youtube:${MAX_RECENT_SEARCHES + 4}`);
  });

  it('removes one entry or clears all', () => {
    const { add, addTrack, remove, clear } = useSearchHistoryStore.getState();
    add('lofi');
    addTrack(t(1));
    remove('q:lofi');
    expect(keys()).toEqual(['t:youtube:1']);
    clear();
    expect(keys()).toEqual([]);
  });

  it('suggests history first, then artists, matching word starts', () => {
    const history = ['arijit singh love songs', 'lofi beats'];
    const artists = ['Arijit Singh', 'Shreya Ghoshal', 'Atif Aslam'];
    expect(suggestionsFor('ari', history, artists)).toEqual(['arijit singh love songs', 'Arijit Singh']);
    expect(suggestionsFor('sing', history, artists)).toEqual(['arijit singh love songs', 'Arijit Singh']);
    expect(suggestionsFor('lofi beats', history, artists)).toEqual([]);
    expect(suggestionsFor('', history, artists)).toEqual([]);
  });
});
