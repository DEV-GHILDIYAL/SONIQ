# Feature: Fast, low-network search UX

**Problem:** Search waits for the slowest source, clears the list to a skeleton on every keystroke, refetches duplicate queries, and keeps dead requests running on weak networks. Previously searched songs should remain reachable offline.

1. Add `searchAllWithBatches`: emit each source's tracks as it resolves; `searchAll` stays a wrapper so DJ/autoplay/recommendations/festival callers are unchanged.
2. Dedupe by id, preserve stable round-robin order, and cache only complete answers (never partial batches).
3. Persist the last 30 complete searches (7-day TTL) in `appStorage`; show saved results instantly, then revalidate in background with a small "Updating…" label.
4. Keep the previous list visible while typing/refreshing; skeleton only on the very first search. Flush debounce on submit instead of waiting another 350ms.
5. Abort stale searches: optional `signal` on `MusicSource.search`, wired through `fetchJson` in archive/fma; late batches from old request keys are ignored.
6. Dedupe identical in-flight searches in the registry; one promise is shared by Search, DJ, autoplay and recommendations.
7. IA/FMA: 12 → 8 items, max 4 concurrent metadata calls, emit each track as its metadata resolves; album/artist pages unchanged.
8. Search-only timeout 6s (audio stays 30s) so a weak source fails fast and other sources still fill the list.
9. Offline copy/state: greyed rows already exist; add "Offline — saved results" / "Connect to search new songs" and keep Play all working for downloaded/local tracks.
10. Tests: fast-before-slow batches, stale/aborted requests, persisted cache, unchanged `searchAll`; verify lint, typecheck, targeted Jest, Android export.
    **Status:** approved by user 2026-11-27 and implemented; risk: later batches may reshuffle slightly, dedupe + stable order keeps it small.
