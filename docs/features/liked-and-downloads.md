# Liked Songs + Downloads

## Step 1: Liked Songs (done)
- `src/store/likedStore.ts` (persisted `soniq:liked`): `tracks` newest first, `toggle(track)`, `remove(id)`; `useIsLiked(id)` hook.
- ♥ button on the player (next to the title) and "Like / Remove from Liked Songs" in the track actions sheet.
- Library: "Liked Songs" row on top (All / Playlists filters) opens `/liked` (Play, Shuffle, list).

## Step 2: Downloads (done)
- `src/lib/downloads.ts`: queue (one at a time), `downloadTracks`, `removeDownload`, `getDownloadedUri`,
  `resolveStream` (player resolver in `_layout`: downloaded file first, else source). Local files are skipped.
- Files: `src/lib/downloadFiles.ts` → `<document>/downloads/<trackId>.<ext>` (copy of YouTube cache file, or direct http download). Never auto-pruned.
- `src/store/downloadStore.ts`: persisted `items`, transient `pending/active/failed`; `useDownloadStatus(id)`.
- UI: Download / Cancel / Retry / Remove in the track actions sheet; ↓ icon on TrackRow; Library "Downloaded" chip (count + size); Liked Songs "Download all".

## Step 3: Save to phone (done)
- `saveToPhone(track)` in `src/lib/downloads.ts`: asks for a folder once (Android SAF, permission persists), downloads if needed,
  then copies the file as "Artist - Title.ext" (no overwrite; adds " (2)"). Folder stored in downloadStore (`phoneFolder`).
- If copying fails (permission revoked / folder deleted) the folder is forgotten so the next save asks again.
- UI: "Save to phone" in the track actions sheet; Library → Downloaded shows the folder with Change/Choose.

## Notification / lock screen
- `scripts/patch-expo-audio.js` (postinstall) patches expo-audio's Android AudioPlayer: Next/Previous buttons on the
  media notification + lock screen (emit `lockScreenNext` / `lockScreenPrevious`, handled in engine.ts), seek buttons 30 s.
- Needs a native rebuild. If expo-audio updates and the anchor text changes, the script warns and skips.
