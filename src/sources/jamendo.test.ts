import { mockFetch } from '@/test/mockFetch';
import { isTrackUnavailable } from '@/lib/errors';
import { createJamendoSource } from './jamendo';

const ok = (results: unknown[]) => ({ headers: { status: 'success', code: 0 }, results });
const raw = {
  id: '123',
  name: 'Sunrise',
  duration: 201,
  artist_name: 'Kavi',
  album_name: '',
  image: 'https://img.test/1.jpg',
  audio: 'https://audio.test/1.mp3',
};

describe('jamendo source', () => {
  const source = createJamendoSource('CLIENT');

  it('maps search results to tracks and sends the client id', async () => {
    const fetch = mockFetch([['api.jamendo.com', ok([raw, { ...raw, id: '9', audio: '' }])]]);
    const tracks = await source.search('sun', 5);
    expect(tracks).toHaveLength(1);
    expect(tracks).toMatchObject([
      {
        id: 'jamendo:123',
        title: 'Sunrise',
        artist: 'Kavi',
        album: undefined,
        durationSec: 201,
        artworkUrl: 'https://img.test/1.jpg',
        source: 'jamendo',
        streamUrlHint: 'https://audio.test/1.mp3',
      },
    ]);
    const url = String(fetch.mock.calls[0]?.[0]);
    expect(url).toContain('client_id=CLIENT');
    expect(url).toContain('search=sun');
  });

  it('throws Jamendo error messages', async () => {
    mockFetch([
      [
        'api.jamendo.com',
        { headers: { status: 'failed', code: 5, error_message: 'bad client id' }, results: [] },
      ],
    ]);
    await expect(source.search('x')).rejects.toThrow('Jamendo: bad client id');
  });

  it('resolves a fresh stream url at play time', async () => {
    const fetch = mockFetch([['api.jamendo.com', ok([raw])]]);
    await expect(
      source.getStreamUrl({
        id: 'jamendo:123',
        title: '',
        artist: '',
        durationSec: 0,
        source: 'jamendo',
      }),
    ).resolves.toBe('https://audio.test/1.mp3');
    expect(String(fetch.mock.calls[0]?.[0])).toContain('id=123');
  });

  it('picks the result whose id matches, not just the first one', async () => {
    mockFetch([
      ['api.jamendo.com', ok([{ ...raw, id: '999', audio: 'https://audio.test/wrong.mp3' }, raw])],
    ]);
    await expect(
      source.getStreamUrl({
        id: 'jamendo:123',
        title: '',
        artist: '',
        durationSec: 0,
        source: 'jamendo',
      }),
    ).resolves.toBe('https://audio.test/1.mp3');
  });

  it('falls back to the URL seen in search when the id lookup misses', async () => {
    mockFetch([['api.jamendo.com', ok([])]]);
    await expect(
      source.getStreamUrl({
        id: 'jamendo:7',
        title: '',
        artist: '',
        durationSec: 0,
        source: 'jamendo',
        streamUrlHint: 'https://audio.test/hint.mp3',
      }),
    ).resolves.toBe('https://audio.test/hint.mp3');
  });

  it('throws TrackUnavailableError when there is no stream at all', async () => {
    mockFetch([['api.jamendo.com', ok([])]]);
    const err = await source
      .getStreamUrl({ id: 'jamendo:1', title: '', artist: '', durationSec: 0, source: 'jamendo' })
      .catch((e: unknown) => e);
    expect(isTrackUnavailable(err)).toBe(true);
  });

  it('maps an album with all its tracks', async () => {
    mockFetch([
      [
        'albums/tracks',
        ok([
          {
            id: '5',
            name: 'Dirty Wings',
            artist_id: '9',
            artist_name: 'Josh',
            image: 'https://img.test/a.jpg',
            tracks: [
              { id: '1', name: 'A', duration: 10, audio: 'https://audio.test/a.mp3' },
              { id: '2', name: 'B', duration: 20, audio: '' },
            ],
          },
        ]),
      ],
    ]);
    const album = await source.getAlbum!('5');
    expect(album.title).toBe('Dirty Wings');
    expect(album.tracks.map((t) => [t.id, t.artist, t.album, t.albumId, t.artistId])).toEqual([
      ['jamendo:1', 'Josh', 'Dirty Wings', '5', '9'],
    ]);
  });
});
