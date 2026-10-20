# SONIQ Decisions (ADR log)

Har decision ek line. Naya decision neeche add karo, purana edit mat karo (superseded ho to sirf status badlo aur naya ADR likho).

Format:
`ADR-NNN | YYYY-MM-DD | Decision | Reason | Status (accepted / superseded by ADR-XXX)`

## Log

- ADR-001 | 2026-10-16 | Web app: Vite + React + TS, native (Expo) nahi | Fast iteration, free static hosting | superseded by ADR-004
- ADR-002 | 2026-10-16 | YouTube/scraping nahi, sirf free/licensed APIs | ToS + legal safety | superseded by ADR-009 (sirf YouTube ke liye)
- ADR-003 | 2026-10-16 | Koi backend nahi (abhi) | Static hosting (Vercel free), keys sirf client-side VITE_ env | superseded by ADR-007
- ADR-004 | 2026-10-16 | Mobile app: Expo (React Native) + TS + Expo Router (src/app) | Native audio, background playback, local files | accepted
- ADR-005 | 2026-10-16 | Tests: Jest + jest-expo (Vitest nahi) | jest-expo sirf Jest preset hai; RN components Vitest mein reliably nahi chalte | accepted
- ADR-006 | 2026-10-16 | Audio: react-native-track-player + expo-dev-client (EAS dev build) | Background play, lock-screen controls, queue; Expo Go support nahi | superseded by ADR-008
- ADR-007 | 2026-10-16 | Koi backend nahi; keys `EXPO_PUBLIC_` env se | Sirf free/public keys, jo bundle mein embed ho sakti hain | accepted
- ADR-008 | 2026-10-16 | Player engine: expo-audio (RNTP hata diya); expo-dev-client rehta hai | RNTP 4.1.2 (latest stable) Kotlin 2.2 pe compile fail (MusicModule.kt Bundle? vs Bundle) | accepted
  - Consequence: background play expo-audio plugin config + setAudioModeAsync se; lock screen controls alag feature hai, abhi sirf plugin config. Queue ab khud src/player/queue.ts mein.
- ADR-009 | 2026-10-16 | YouTube source via youtubei.js on-device (personal testing only, Play Store build mein nahi) | Invidious public instances PO-token/IP block se playback nahi dete; background play chahiye aur koi server nahi | accepted
  - Consequence: YouTube changes se toot sakta hai. Har failure ka stage Settings > YouTube mein dikhta hai; fix usually `npm update youtubei.js`.
- ADR-010 | 2026-10-17 | YouTube PO token via BotGuard in hidden react-native-webview (BgUtils/NewPipe flow) + Range download to cache + next-track prefetch | Bina PO token YouTube sirf pehla ~1 MB deta hai (diag 1M-2M=403); server nahi chahiye, screen-off play chahiye | accepted
- ADR-011 | 2026-10-17 | YouTube via own backend (`server/`, Node + Express + yt-dlp, Docker, Render free) that proxies audio | On-device: har video pe sirf ~1 MB (session/visitor badalne pe bhi), WebView PO token trusted nahi; yt-dlp server pe PO/JS challenges khud handle karta hai | accepted (supersedes on-device part of ADR-009/010)
- ADR-012 | 2026-10-20 | YouTube playback: direct progressive stream (VISIONOS URL + User-Agent + native `Range: bytes=0-` on the first request); download sirf fallback/Save to phone | Partially downloaded file ExoPlayer mein reliable nahi (MP4 moov/EOF, seek tootta); direct stream se pehla buffer aate hi play, 1-hour video bhi instant, disk/network waste nahi. ExoPlayer ka pehla request bina Range jaata hai aur YouTube use ~512 KB pe throttle karta hai, isliye patched `OkHttpDataSource` position 0 pe `Range: bytes=0-` lagata hai (seek pe Media3 ka apna Range rehta hai). SDK 58 prebuilt AAR ko bypass karne ke liye `expo-audio` `buildFromSource` mein hai. Stream 403/410 de ya 12 s tak stall ho to ek baar downloaded file pe retry | accepted (supersedes playback part of ADR-010/011; server fallback rehta hai)
