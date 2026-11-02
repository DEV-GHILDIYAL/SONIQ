# Search play + "Recommended for you"

- Tapping a search result (or a recent song) plays only that song: `playQueue([track], 0)`.
  When it ends, the engine's autoplay (personal radio: flow + taste + discovery) continues.
  Autoplay off in Settings: playback stops after the song.
- "Play all" above the results plays the whole result list in order (old behaviour).
- Engine records autoplay-added songs in `playerStore.recommendedIds` (cleared on every new
  queue the user starts). Player header shows "Recommended for you"; the queue shows a
  "RECOMMENDED FOR YOU" heading where those songs start. Jam / DJ labels take priority.
- Album, artist, playlist and Liked pages keep playing their list in order.
