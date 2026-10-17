# Sleep timer, search history, quick search

## Sleep timer
- `src/player/sleep.ts`: store (`endsAt`, `endOfTrack`, `fadeStartedAt`) + pure `sleepDecision()`.
- When due, the current song fades over its last 8 s and playback stops instead of advancing.
  If more than 5 min of the song is left, it fades out right away. Due while paused → timer just turns off.
- Engine applies it (`applySleep` on status ticks, check in `advance`). `turnOffSleepTimer()` restores volume.
- UI: moon button in the player top bar → `SleepTimerSheet` (15/30/45/60/90 min, End of this song, Turn off); "SLEEP · N MIN" under the source label.

## Search history + suggestions
- `src/store/searchHistoryStore.ts` (persisted, 15 max, unique). Saved on keyboard Search, on playing a result, and on tapping a suggestion.
- Empty search: "Recent searches" (tap to search, × to remove, Clear).
- While typing: suggestion chips from history + artists you play (`suggestionsFor`).

## Quick search from Home
- Home search box navigates with a fresh `focus` param; Search focuses the input so the keyboard opens immediately.
