# Profile banner + tab bar everywhere

## Tab bar on every page
- Pages opened on top of the tabs (playlist, liked, album, artist, mix, community, ai-playlist,
  settings, stats, about, appearance) draw a copy of the tab bar: `src/components/GlobalTabBar.tsx`.
- It highlights the tab the user came from (`useLastTab`, set by `(tabs)/_layout.tsx`).
- Tapping a tab closes the pages on top (`router.dismissAll()`) and switches tab.
- `Screen` reserves the bar's height at the bottom; the mini player floats right above it.
- Hidden while the keyboard is open. Not shown on: player, queue (modals), restore, friend,
  clan-join (one-off flows) and clan chat (message box at the bottom).

## Profile banner
- 3:1 banner at the top of Profile; the photo overlaps its bottom edge. No banner: accent gradient.
- Tap the banner: Add / Change / Remove. Picked image is centre-cropped to 3:1, max 1500x500 JPEG.
- Upload reuses the `avatar` Edge Function with `kind: 'banner'` -> `avatars/<id>/banner.jpg`
  (same ID + secret check, same bucket limits). No new bucket, no new SQL.
- The public URL (`?v=` timestamp) is kept in the cloud library backup (`banner`), so a restore
  brings it back, same as the photo. Shown only on your own profile for now.
