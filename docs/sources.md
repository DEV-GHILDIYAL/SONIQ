# SONIQ Sources

## Adapter contract

```ts
// src/sources/types.ts
export interface Track {
  id: string; // "<source>:<originalId>" format
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  artworkUrl?: string;
  source: SourceId;
  albumId?: string; // Album page (registry.albumKey -> "<source>:<albumId>")
  artistId?: string; // Artist page (registry.artistKey)
  streamUrlHint?: string; // URL seen in listing; fallback only, getStreamUrl resolves fresh
}

export interface TrackCollection {
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  tracks: Track[];
}

export type SourceId = 'jamendo' | 'archive' | 'fma' | 'local' | 'youtube';

export interface MusicSource {
  id: SourceId;
  label: string; // UI mein dikhane ke liye
  search(query: string, limit?: number): Promise<Track[]>;
  getStreamUrl(track: Track): Promise<string>; // playable URL (mp3/ogg, https ya file://), download ke liye
  getPlaybackSource?(track: Track): Promise<PlaybackSource>; // optional: direct stream + headers
  getAlbum?(albumId: string): Promise<TrackCollection>;
  getArtist?(artistId: string): Promise<TrackCollection>;
}

export interface PlaybackSource {
  uri: string; // https ya file://
  headers?: Record<string, string>; // e.g. YouTube VISIONOS User-Agent
  canDownloadFallback?: boolean; // stream fail ho to engine downloaded file maang sakta hai
}
```

**Unplayable tracks:** jo track kabhi nahi chal sakta (stream nahi, file delete) uske liye adapter `TrackUnavailableError` (`src/lib/errors.ts`) throw kare. Engine use `unavailableStore` mein mark karke search/album/artist se chhupa deta hai aur agla gaana chala deta hai. Network errors ke liye ye error **mat** use karo, warna offline hone pe gaane hamesha ke liye chhup jayenge. Settings -> "Show hidden songs again" list reset karta hai.

## Rules for every adapter

- Sirf free/licensed APIs ya personal-use YouTube source (neeche). Naya scraping code mat likho.
- Errors throw karo, console mein silently swallow mat karo.
- `search` empty array de sakta hai, kabhi undefined nahi.
- Stream URL expire ho sakta hai, isliye `getStreamUrl` player ke waqt call hoga, pehle se cache nahi.
- Player ke liye `getPlaybackSource?()` optional hai: direct stream + headers return karta hai (bina download play). Na ho to player `getStreamUrl()` use karta hai.
- Har adapter ka unit test (Jest): mocked fetch, real API call nahi.

## Sources

Status (2026-10-20): paanch sources implement ho gaye (YouTube personal use). Jamendo sirf tab register hota hai jab `.env` mein key ho.

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

### YouTube (`youtube`, `src/sources/youtube.ts`) — personal use only
- On-device default: `youtubei.js` + `VISIONOS` client (`location: IN`, `retrieve_player: false`). Player script ki zaroorat nahi, isliye session fast banti hai. Optional fallback: `server/` (Node + yt-dlp) via `EXPO_PUBLIC_SONIQ_SERVER_URL` / `..._KEY`.
- `search` -> `yt.search(q, { type: 'video' })`, `youtube:<videoId>` ids, live/upcoming (duration 0) aur duplicate videos drop.
- **Play (no download):** `getPlaybackSource` -> `getBasicInfo(videoId, { client: VISIONOS })` -> `chooseFormat(audio, mp4/any)` -> direct googlevideo URL + VISIONOS `User-Agent` header. Player `OkHttpDataSource` isse stream karta hai, isliye 1-hour video bhi pehle buffer pe start hoti hai aur seek Range requests se chalta hai.
- URL 10 min tak memory mein cache hota hai (`expire` se pehle); `prefetch` sirf yahi URL warm karta hai, koi bytes download nahi.
- **Download path:** `getStreamUrl` (Save to phone / player fallback) `downloadMedia` se 1 MB Range chunks, 3 parallel, cache mein `<cache>/youtube/<id>.m4a|webm`. 403/410 pe ek baar fresh URL resolve karke retry.
- **Player fallback:** direct stream 403/410 de to engine ek baar `getPlaybackSource(track, { preferDownload: true })` -> `getStreamUrl` se downloaded file chalata hai (`canDownloadFallback`, sirf 20 min tak ke tracks; 1-hour video stream hi rehti hai).
- Cache: 300 MB ya 40 files (jo pehle), 10 min se nayi files protect; `.part`/`.chunk` kabhi cached media nahi maani jaati.
- Errors: 401/429/502 server fallback mein, 403 = VISIONOS trick toot sakta hai. Settings > YouTube ka self-test sirf session + search + URL resolve karta hai (download nahi).

## Adding a new source

1. `src/sources/<name>.ts` banao, `MusicSource` implement karo.
2. `SourceId` union mein naam add karo.
3. `registry.ts` mein ek line add karo.
4. Unit test likho.
5. Is file mein source ki details add karo.
