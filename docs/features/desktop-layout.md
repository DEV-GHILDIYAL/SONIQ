# Desktop layout (v1.9.0)

- `useIsDesktop()`: web build (Windows app) and window >= 900 px. Narrow windows keep the phone UI.
- Root layout always renders the same tree (sidebar / player bar render nothing on phones),
  so resizing never re-mounts the pages.
- `Sidebar`: Home, Search, Library, Jam, Clans (unread badge), Friends (request badge),
  Liked Songs + every playlist, profile + settings at the bottom. Hover states via `hov()`.
- `PlayerBar`: song + like, shuffle / prev / play / next / repeat, click-or-drag seek bar with
  times, queue, mute, volume slider. Volume is persisted (`playerStore.volume`) and applied by
  the engine; DJ ducking and the sleep fade scale it instead of resetting to 100%.
- `Shortcuts`: Space, Ctrl+→/←, Shift+→/← (±10 s), Ctrl+↑/↓ volume, Ctrl+K or / search,
  Ctrl+L like; ignored while typing.
- Sheets become centred 440 px dialogs on desktop. Bottom tabs, floating tab bar and mini player
  are hidden on desktop.

## v1.10.0
- Right panel (window >= 1180 px, remembered open/closed + tab in `useDesktopStore`):
  "Up next" (now playing card over a blur of its cover, like, queue with remove on hover,
  "Recommended for you" marker) and "Friends" (requests, friends in public Jams with Join,
  everyone else -> profile). Player bar: queue + friends buttons toggle it.
- `installWebStyles()`: thin scrollbars that only show on hover; no text selection outside inputs.
- Profile / user banner capped at 200 px on desktop. Search suggestions row no longer squeezed.
- Sidebar shows your profile photo.

## v1.11.0
- Player bar lives under the page column only and renders nothing when the queue is empty.
- Home header avatar hidden on PC (profile is at the bottom of the sidebar).
- PC hides: downloads (actions, Library chip, profile row, liked "download all"), haptics row,
  phone notifications section + permission prompt; Settings shows "Updates: Automatic".
- PC onboarding: gradient brand panel + 440 px card instead of full-width buttons.
