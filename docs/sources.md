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
}

export type SourceId = 'jamendo' | 'archive' | 'fma' | 'local';

export interface MusicSource {
  id: SourceId;
  label: string;                                  // UI mein dikhane ke liye
  search(query: string, limit?: number): Promise<Track[]>;
  getStreamUrl(track: Track): Promise<string>;   // playable URL (mp3/ogg)
}
```

## Rules for every adapter
- Sirf free/licensed APIs. Scraping ya YouTube/yt-dlp type code nahi.
- Errors throw karo, console mein silently swallow mat karo.
- `search` empty array de sakta hai, kabhi undefined nahi.
- Stream URL expire ho sakta hai, isliye `getStreamUrl` player ke waqt call hoga, pehle se cache nahi.
- Har adapter ka unit test: mocked fetch, real API call nahi.

## Sources

### Jamendo
- Docs: https://developer.jamendo.com
- Auth: client_id query param (free key, `.env` mein `VITE_JAMENDO_CLIENT_ID`)
- Search: `/v3.0/tracks/?client_id=...&format=json&namesearch=<query>&include=musicinfo`
- Stream: track ka `audio` field (mp3 URL)
- License: Creative Commons, personal/non-commercial use check karo

### Internet Archive (archive)
- Docs: https://archive.org/developers
- Auth: nahi chahiye
- Search: `https://archive.org/advancedsearch.php?q=<query>+AND+mediatype:audio&fl[]=identifier,title,creator&output=json`
- Stream: `https://archive.org/download/<identifier>/<file>.mp3` (file list `https://archive.org/metadata/<identifier>` se)
- Track ka id = identifier + file name

### Free Music Archive (fma)
- Public API ya dataset: check karo, key chahiye ho sakti hai
- Status: API availability verify karni hai, pehle Jamendo + archive se shuru karo

### Local files (local)
- Auth: nahi
- Flow: `<input type="file" accept="audio/*" multiple>` -> `URL.createObjectURL(file)` ya IndexedDB mein Blob
- Metadata: file name se title, artist "Unknown" fallback
- Search: sirf in-memory list filter
- Persistence: IndexedDB

## Adding a new source
1. `src/sources/<name>.ts` banao, `MusicSource` implement karo.
2. `SourceId` union mein naam add karo.
3. `registry.ts` mein ek line add karo.
4. Unit test likho.
5. Is file mein source ki details add karo.
