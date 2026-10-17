# Feature: YouTube playback on-device (testing only)

**Goal:** YouTube tracks play with the screen off (background + lock screen), no server.

1. Replace Invidious in `src/sources/youtube.ts` with `youtubei.js` (InnerTube client, runs on the phone).
2. `search()` -> `Innertube.search(query, { type: 'video' })` -> map to `Track` (same `youtube:<id>` ids).
3. `getStreamUrl()` -> `getBasicInfo(id)` -> `chooseFormat({ type: 'audio', quality: 'best', format: 'mp4' })` -> deciphered URL.
4. URL goes to the existing `expo-audio` engine, so background/lock-screen work as for Jamendo. No change in `src/player/`.
5. JS-only polyfills (URL, TextDecoder; no native rebuild) in a new `src/lib/polyfills.ts`, imported first in `_layout.tsx`.
6. Decipher needs a JS evaluator: wire `Platform.shim.eval` in `src/lib/youtubeShim.ts`.
7. Innertube instance created once and cached; on stream failure retry once with a fresh session.
8. Errors: network/decipher failure = plain Error (track not hidden); "video unavailable" = `TrackUnavailableError`.
9. Step 0 (spike, ~1 hr): prove one song plays on device before the full rewrite. If it fails, stop and report.
10. Tests: mock youtubei.js, cover mapping + format choice + error types.
11. Breakage diagnostics: every failure tagged with a stage (network/session/search/blocked/formats/decipher/stream), stream URL verified with a 1-byte range request, last status saved in `sourceHealthStore`, Settings > YouTube row shows Working/Broken and runs a self-test on tap.

**Risk:** YouTube changes break it periodically -> fix = `npm update youtubei.js`. Not for Play Store.

**Status:** implemented 2026-10-16.
