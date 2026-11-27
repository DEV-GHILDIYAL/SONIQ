# Feature: YouTube search fix for lockup results

**Problem:** YouTube serves `lockupViewModel` search results on some devices/regions. `youtubei.js@18.1.0` exposes them as `LockupView` (`content_id`, `metadata.title`, no `video_id`/`duration`), so `src/sources/youtube.ts` drops every result and reports a false "Working" health status.

1. Extend `nodeToTrack` to read both shapes: `video_id` or `content_id`, `title` or `metadata.title`.
2. Extract artwork from `content_image` (`thumbnailViewModel.image[].url`) as well as the old thumbnail fields.
3. Parse duration from the lockup thumbnail badge (`m:ss` / `h:mm:ss`); keep VIDEO/MOVIE lockups with unknown duration instead of dropping them.
4. Skip `SHORT`/`STATION` lockups and LIVE badges; keep the existing live/upcoming filter for classic videos.
5. Treat zero results for the known self-test query as a failure and include raw node-type counts in the health details; legitimate empty user queries stay silent.
6. Retry with the configured server fallback when on-device search returns no tracks (not only when it throws).
7. Add unit tests for classic, lockup, and empty-result responses; verify with `npm run lint`, `npm run typecheck`, `npm test`.
8. Ship as patch release `v1.11.1` (`app.json` version + versionCode + changelog).

**Risk:** YouTube may add more item shapes; the health details expose node counts so the next change is diagnosable.
**Status:** approved by user 2026-11-27.
