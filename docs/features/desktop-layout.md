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
