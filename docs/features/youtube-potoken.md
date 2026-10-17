# Feature: YouTube PO token (BotGuard in a hidden WebView)

**Problem:** without a PO token YouTube serves only the first ~1 MB of a stream (diag: `0-1M=206, 1M-2M=403`) on every client.
**Goal:** full songs, screen-off playback, free, no server.

1. `react-native-webview` (native, one rebuild). Hidden `<PoTokenWebView/>` mounted once in `_layout.tsx`.
2. WebView loads a tiny HTML page with base URL `https://www.youtube.com` and runs YouTube's BotGuard (port of LuanRT/BgUtils, same flow as NewPipe): `jnn/v1/Create` -> run interpreter -> snapshot -> `GenerateIT` -> minter.
3. `src/lib/poToken.ts` = bridge (RN <-> WebView): `mintPoTokens(ids)`, waits for ready, timeouts, re-inits when the integrity token expires.
4. `youtube.ts`: session gets a PO token minted for its visitorData (used as `pot` on stream URLs + player requests). Clients: MWEB -> WEB -> ANDROID_VR -> IOS.
5. If a download still gets 403, retry once with a token bound to the video id.
6. WebView/BotGuard failure = new stage `potoken` (Settings + logs); tokenless clients are still tried.
7. youtubei.js cache on disk (`src/lib/fileKvCache.ts`) so the player script/session are not re-downloaded each start (was ~21 s).
8. Session recreated after 6 h (token lifetime).
9. Engine prefetches the next queued track (`source.prefetch`), so YouTube songs download while the current one plays: no gap, works with screen off.
10. Tests: bridge (ready/mint/timeout/error), youtube session + pot retry, engine prefetch.

**Risk:** BotGuard/YouTube changes. Fix path: update `youtubei.js` / port the latest BgUtils changes into `poTokenHtml.ts`.
**Status:** implemented 2026-10-17, needs on-device test.
