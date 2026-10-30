# UI polish (v1.3.5)

1. Artwork uses `expo-image` with `cachePolicy="memory-disk"`: covers are kept on disk and show instantly (also offline). Colored fallback when missing or broken.
2. `src/lib/network.ts`: `expo-network` state in a small store, started from the root layout. Unknown state counts as online.
3. `OfflineBanner`: "Offline · only saved songs play" strip at the top; "Back online" for 2.5 s.
4. Offline, songs that are not on the phone (not local, not downloaded) are shown at 40% opacity. They stay tappable (a cached copy may still play); a failure shows a plain offline message.
5. Offline, next / auto-advance skips songs that need internet; if none are left, playback stops with a note.
6. `Skeleton` (pulsing rows) replaces the list spinners on Search and Album / Artist pages. Spinners inside buttons stay.
7. `ErrorState` + `friendlyError()`: plain-language errors (offline, not available, service busy, generic) with a Retry button. Player and mini player show friendly text; their play button becomes Retry on error (`engine.retry()`).
8. Haptics (`src/lib/haptics.ts`, `expo-haptics`): play/pause, skip, like, long-press, Jam connected. Settings > Haptic feedback.
9. Mini player: horizontal swipe (PanResponder, no gesture library) — left = next, right = previous.
10. Player background: blurred cover (`expo-image` `blurRadius`) under a gradient (`expo-linear-gradient`) instead of a colour wash.
11. Jamendo removed: not registered, no env var. `'jamendo'` stays in `SourceId` so saved songs load; playing one throws `TrackUnavailableError` so the player skips it.
