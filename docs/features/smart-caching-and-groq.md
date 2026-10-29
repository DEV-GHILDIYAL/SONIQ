# Feature Spec: Smart Audio Caching, Track Sync, Listening Stats & Groq Recommendations

## 1. Background Song & Next-Track Caching
- Stream starts immediately without waiting for a full file download.
- As a track plays, a background task progressively downloads and stores the entire song in `mediaCache` (`youtube/`, etc.).
- Subsequent clicks on the same track check disk cache first (`getCachedMedia`), returning `file://` URI instantly with zero network delay and offline capability.
- When current track begins playback, the next track in the queue is automatically pre-cached to disk in the background.

## 2. Track Switching & Desync Fix (Low/Slow Network)
- When a user taps a new song: immediately pause and reset previous audio playback to eliminate audio bleed.
- State updates immediately to `status: 'loading'` with the new track's metadata.
- Media session / lock screen updates instantly to the new track's title, artist, and artwork.
- Stream resolution includes a timeout (8-10s) with fallback to avoid indefinite hangs on bad networks.

## 3. User Listening Stats Dashboard
- Profile screen exposes all-time listening insights recorded in `useProfileStore`:
  - Total Listening Time (formatted as Hours and Minutes).
  - Total Songs Played counter.
  - Top Artists list with play counts.
  - Top Favorite Genres with visual badges.

## 4. Groq AI Music Recommendation Engine
- `src/lib/groq.ts` integrates with Groq's fast LLM API (`llama-3.3-70b-versatile` / `llama-3.1-8b-instant`).
- Uses listening history, top genres, current seed track, and user taste to generate next recommended song.
- Plugs into `autoplay.ts` so when queue ends (or AI Radio is active), the recommended song is resolved and queued seamlessly.
- Configured via `EXPO_PUBLIC_GROQ_API_KEY` in `.env` and custom API key option in Settings.
