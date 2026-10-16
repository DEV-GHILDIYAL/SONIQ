import { usePlaylistStore } from './playlistStore';

const store = () => usePlaylistStore.getState();

beforeEach(() => {
  usePlaylistStore.setState({ playlists: [] });
});

describe('playlistStore', () => {
  it('creates playlists newest first with a trimmed name', () => {
    store().createPlaylist('  Chill  ');
    store().createPlaylist('Workout');
    expect(store().playlists.map((p) => p.name)).toEqual(['Workout', 'Chill']);
    expect(store().playlists[0]?.tracks).toEqual([]);
  });

  it('renames a playlist', () => {
    const p = store().createPlaylist('Old');
    store().renamePlaylist(p.id, 'New');
    expect(store().playlists[0]?.name).toBe('New');
  });

  it('deletes a playlist', () => {
    const p = store().createPlaylist('Temp');
    store().deletePlaylist(p.id);
    expect(store().playlists).toEqual([]);
  });

  it('rejects empty names', () => {
    expect(() => store().createPlaylist('   ')).toThrow('empty');
    const p = store().createPlaylist('Keep');
    expect(() => store().renamePlaylist(p.id, '')).toThrow('empty');
    expect(store().playlists[0]?.name).toBe('Keep');
  });
});

describe('playlist editing', () => {
  const track = (n: number) => ({
    id: `jamendo:${n}`,
    title: `T${n}`,
    artist: 'A',
    durationSec: 1,
    source: 'jamendo' as const,
  });

  it('adds tracks without duplicates and reports how many were added', () => {
    const p = store().createPlaylist('Mix');
    expect(store().addTracks(p.id, [track(1), track(2)])).toBe(2);
    expect(store().addTracks(p.id, [track(2), track(3)])).toBe(1);
    expect(store().playlists[0]?.tracks.map((t) => t.id)).toEqual([
      'jamendo:1',
      'jamendo:2',
      'jamendo:3',
    ]);
  });

  it('removes and reorders tracks', () => {
    const p = store().createPlaylist('Mix');
    store().addTracks(p.id, [track(1), track(2), track(3)]);
    store().moveTrack(p.id, 2, 0);
    store().removeTrack(p.id, 'jamendo:1');
    expect(store().playlists[0]?.tracks.map((t) => t.id)).toEqual(['jamendo:3', 'jamendo:2']);
  });
});
