# SONIQ Decisions (ADR log)

Har decision ek line. Naya decision neeche add karo, purana edit mat karo (superseded ho to sirf status badlo aur naya ADR likho).

Format:
`ADR-NNN | YYYY-MM-DD | Decision | Reason | Status (accepted / superseded by ADR-XXX)`

## Log
- ADR-001 | 2026-10-16 | Web app: Vite + React + TS, native (Expo) nahi | Fast iteration, free static hosting | superseded by ADR-004
- ADR-002 | 2026-10-16 | YouTube/scraping nahi, sirf free/licensed APIs | ToS + legal safety | accepted
- ADR-003 | 2026-10-16 | Koi backend nahi (abhi) | Static hosting (Vercel free), keys sirf client-side VITE_ env | superseded by ADR-007
- ADR-004 | 2026-10-16 | Mobile app: Expo (React Native) + TS + Expo Router (src/app) | Native audio, background playback, local files | accepted
- ADR-005 | 2026-10-16 | Tests: Jest + jest-expo (Vitest nahi) | jest-expo sirf Jest preset hai; RN components Vitest mein reliably nahi chalte | accepted
- ADR-006 | 2026-10-16 | Audio: react-native-track-player + expo-dev-client (EAS dev build) | Background play, lock-screen controls, queue; Expo Go support nahi | accepted
- ADR-007 | 2026-10-16 | Koi backend nahi; keys `EXPO_PUBLIC_` env se | Sirf free/public keys, jo bundle mein embed ho sakti hain | accepted
