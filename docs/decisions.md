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
