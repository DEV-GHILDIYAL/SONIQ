import { mockFetch } from '@/test/mockFetch';
import {
  createInternetArchiveSource,
  parseLength,
  sanitizeQuery,
  streamUrlFor,
} from './internetArchive';

const source = createInternetArchiveSource({
  id: 'archive',
  label: 'IA',
  filter: 'collection:netlabels',
});

describe('internet archive source', () => {
  it('searches, loads metadata and keeps only items with an MP3', async () => {
    const fetch = mockFetch([
      [
        'advancedsearch.php',
        { response: { docs: [{ identifier: 'album1' }, { identifier: 'noaudio' }] } },
      ],
      [
        'metadata/album1',
        {
          metadata: { title: 'Night Album', creator: ['Lumen'] },
          files: [
            { name: 'cover.jpg', format: 'JPEG' },
            { name: 'Track One.mp3', format: 'VBR MP3', length: '3:05', title: 'Track One' },
          ],
        },
      ],
      [
        'metadata/noaudio',
        { metadata: { title: 'x' }, files: [{ name: 'a.jpg', format: 'JPEG' }] },
      ],
    ]);

    const tracks = await source.search('night', 10);
    expect(tracks).toEqual([
      {
        id: 'archive:album1/Track One.mp3',
        title: 'Track One',
        artist: 'Lumen',
        album: 'Night Album',
        durationSec: 185,
        artworkUrl: 'https://archive.org/services/img/album1',
        source: 'archive',
        albumId: 'album1',
        artistId: 'Lumen',
      },
    ]);
    const searchUrl = decodeURIComponent(String(fetch.mock.calls[0]?.[0]));
    expect(searchUrl).toContain('collection:netlabels');
    expect(searchUrl).toContain('format:"VBR MP3"');
  });

  it('uses the per-file artist field (FMA mirror items)', async () => {
    mockFetch([
      ['advancedsearch.php', { response: { docs: [{ identifier: 'fma1' }] } }],
      [
        'metadata/fma1',
        {
          files: [
            {
              name: 'a.mp3',
              format: 'VBR MP3',
              length: '428.12',
              title: 'Things',
              artist: 'Adam and Alma',
            },
          ],
        },
      ],
    ]);
    const [track] = await source.search('x');
    expect(track?.artist).toBe('Adam and Alma');
    expect(track?.durationSec).toBe(428);
  });

  it('skips items whose metadata request fails', async () => {
    mockFetch([['advancedsearch.php', { response: { docs: [{ identifier: 'gone' }] } }]]);
    await expect(source.search('x')).resolves.toEqual([]);
  });

  it('propagates search errors', async () => {
    mockFetch([['advancedsearch.php', new TypeError('offline')]]);
    await expect(source.search('x')).rejects.toThrow(/Network error/);
  });

  it('builds encoded download urls from the track id', async () => {
    const url = await source.getStreamUrl({
      id: 'archive:my item/disc 1/01 Song.mp3',
      title: '',
      artist: '',
      durationSec: 0,
      source: 'archive',
    });
    expect(url).toBe('https://archive.org/download/my%20item/disc%201/01%20Song.mp3');
    expect(() =>
      streamUrlFor({
        id: 'archive:broken',
        title: '',
        artist: '',
        durationSec: 0,
        source: 'archive',
      }),
    ).toThrow('Invalid');
  });
});

describe('helpers', () => {
  it('parses lengths', () => {
    expect(parseLength('234.6')).toBe(235);
    expect(parseLength('3:54')).toBe(234);
    expect(parseLength('1:02:03')).toBe(3723);
    expect(parseLength(undefined)).toBe(0);
  });

  it('strips query syntax', () => {
    expect(sanitizeQuery('rock AND (title:"x")*')).toBe('rock AND title x');
  });
});
