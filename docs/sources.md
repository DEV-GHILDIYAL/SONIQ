# SONIQ Sources

## Adapter contract

```ts
// src/sources/types.ts
export interface Track {
  id: string;            // "<source>:<originalId>" format
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  artworkUrl?: string;
  source: SourceId;
  albumId?: string;      // Album page (registry.albumKey -> "<source>:<albumId>")
  artistId?: string;     // Artist page (registry.artistKey)
  streamUrlHint?: string; // URL seen in listing; fallback only, getStreamUrl resolves fresh
}

export interface TrackCollection { title: string; subtitle?: string; artworkUrl?: string; tracks: Track[] }

export type SourceId = 'jamendo' | 'archive' | 'fma' | 'local';

export interface MusicSource {
  id: SourceId;
  label: string;                                  // UI mein dikhane ke liye
  search(query: string, limit?: number): Promise<Track[]>;
  getStreamUrl(track: Track): Promise<string>;   // playable URL (mp3/ogg, https ya file://)
  getAlbum?(albumId: string): Promise<TrackCollection>;
  getArtist?(artistId: string): Promise<TrackCollection>;
}
```

**Unplayable tracks:** jo track kabhi nahi chal sakta (stream nahi, file delete) uske liye adapter `TrackUnavailableError` (`src/lib/errors.ts`) throw kare. Engine use `unavailableStore` mein mark karke search/album/artist se chhupa deta hai aur agla gaana chala deta hai. Network errors ke liye ye error **mat** use karo, warna offline hone pe gaane hamesha ke liye chhup jayenge. Settings -> "Show hidden songs again" list reset karta hai.

## Rules for every adapter
- Sirf free/licensed APIs. Scraping ya YouTube/yt-dlp type code nahi.
- Errors throw karo, console mein silently swallow mat karo.
- `search` empty array de sakta hai, kabhi undefined nahi.
- Stream URL expire ho sakta hai, isliye `getStreamUrl` player ke waqt call hoga, pehle se cache nahi.
- Har adapter ka unit test (Jest): mocked fetch, real API call nahi.

## Sources

Status (2026-10-16): sab chaar implement ho gaye. Jamendo sirf tab register hota hai jab `.env` mein key ho.

### Jamendo (`src/sources/jamendo.ts`)
- Docs: https://developer.jamendo.com/v3.0/tracks
- Auth: `client_id` query param; `.env` mein `EXPO_PUBLIC_JAMENDO_CLIENT_ID` (free key). Key nahi -> source register nahi hota, Settings "Add key in .env" dikhata hai.
- Search: `GET /v3.0/tracks/?client_id&format=json&audioformat=mp32&search=<q>&limit&imagesize=300&boost=popularity_total`
- Stream: play ke waqt `GET /v3.0/tracks/?id=<id>` se fresh `audio` URL (expire ho sakta hai).
- Errors: `headers.status !== 'success'` -> `Jamendo: <error_message>` throw.
- License: Creative Commons, personal/non-commercial use check karo

### Internet Archive (`archive`, `src/sources/archive.ts`)
- Docs: https://archive.org/developers
- Auth: nahi chahiye
- Search: `advancedsearch.php?q=(<q>) AND mediatype:audio AND collection:netlabels AND format:"VBR MP3"&fl[]=identifier&sort[]=downloads desc&rows<=12`
  - `netlabels` = curated CC releases (opensource_audio mein bahut noise tha).
- Har item ka `metadata/<identifier>` -> pehli MP3 file -> ek Track. MP3 nahi to item skip.
- Track id: `archive:<identifier>/<file name>`; stream: `https://archive.org/download/<identifier>/<file>` (stable, network call nahi).
- Artwork: `https://archive.org/services/img/<identifier>`
- Shared code: `src/sources/internetArchive.ts` (archive + fma dono use karte hain).

### Free Music Archive (`fma`, `src/sources/fma.ts`)
- FMA ki apni API ab naye keys nahi deti ("we are no longer granting API keys", freemusicarchive.org/api).
- Isliye FMA ka official Internet Archive mirror use karte hain: `collection:freemusicarchive` (same IA helper).
- Kai mirror items mein audio nahi hai -> query mein `format:"VBR MP3"` filter + metadata check.
- FMA files mein artist `artist` field mein hota hai (`creator` nahi) — adapter dono check karta hai.

### Local files (`local`, `src/sources/local.ts`)
- Auth: nahi
- Flow: `expo-document-picker` (`type: 'audio/*'`, `multiple: true`) -> `expo-file-system` (`File.copy`) se `Paths.document/music/` mein copy -> `file://` URI
- List: `src/store/localLibraryStore.ts` (AsyncStorage `soniq:local-library`)
- Metadata: file name se title, artist "Unknown artist"; duration 0 (player chalne pe asli duration aata hai)
- Search: in-memory title filter
- UI import: Library -> "Import local files" (`importLocalFiles` registry se re-export)

## Adding a new source
1. `src/sources/<name>.ts` banao, `MusicSource` implement karo.
2. `SourceId` union mein naam add karo.
3. `registry.ts` mein ek line add karo.
4. Unit test likho.
5. Is file mein source ki details add karo.
