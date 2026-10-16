# Feature: Player + Library v2

**Goal:** Playlist editing, queue control, shuffle/repeat, lock-screen/notification controls, Album & Artist pages. (Local import + Jamendo/IA/FMA already done. No YouTube, ever.)

**Files:**
- `src/player/queue.ts` — `shuffle` (current track stays first, original order kept for un-shuffle), `repeat: 'off'|'all'|'one'`, `playNext`, `addToQueue`, `removeAt`, `move(from,to)`
- `src/player/engine.ts` — repeat/shuffle in `next()`/end-of-track; sync status from native events (lock-screen pause/play); `setActiveForLockScreen` + `updateLockScreenMetadata` on every track (title, artist, album, artwork); seek ±10s on lock screen
- `src/store/playerStore.ts` — `shuffle`, `repeat` state (persisted)
- `src/store/playlistStore.ts` — `addTracks`, `removeTrack`, `moveTrack`
- `src/components/TrackActions.tsx` — long-press / ⋮ sheet on any track: Play next, Add to queue, Add to playlist, Go to album, Go to artist (+ Remove from playlist inside a playlist)
- `src/app/queue.tsx` — Up next list: tap to jump, remove, move up/down, Clear
- `src/app/album/[id].tsx`, `src/app/artist/[name].tsx` — tracks grouped by album/artist (Jamendo album/artist API; IA item = album; local = from library)
- `src/app/player.tsx` — shuffle + repeat buttons, queue button; playlist detail gets edit (remove/reorder)

**Acceptance:** lint/typecheck/test/export pass; unit tests for queue ops, shuffle/repeat rules, playlist edits, lock-screen calls (mocked expo-audio); UI imports only registry/types; expo-audio only in `src/player/`.

**Limitation:** lock screen pe Next/Prev buttons sirf expo-audio ke native playlist mode mein aate hain. v2 mein Play/Pause + ±10s seek; Next/Prev = engine rewrite (alag feature).

**Out of scope:** YouTube/any scraping, drag-and-drop reorder (up/down buttons instead), lyrics, equalizer, downloads.

## Status (2026-10-16): done
- Sab 7 items + Jamendo "not available for streaming" fix (streamUrlHint fallback + unavailable tracks hide/skip, sirf TrackUnavailableError pe).
- Lock screen: title/artist/album/artwork + Play/Pause + ±10s seek. Next/Prev = alag feature (native playlist mode).
- 93 Jest tests; web preview (390x844) se Player, Queue, Album, actions sheet, playlist edit check kiye.
