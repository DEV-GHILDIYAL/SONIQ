# SONIQ — Claude instructions

Free, ad-free music player. Expo (React Native) + TypeScript (strict) + Expo Router. Backend sirf `server/` (YouTube proxy, personal use).
Sources: Jamendo, Internet Archive, Free Music Archive, local files, YouTube (personal use only, via own backend `server/`: Node + yt-dlp).

## Hard rules

1. Sirf free/licensed APIs. Exception: YouTube source sirf personal use ke liye hai, Play Store build mein nahi jayega. App mein YouTube/yt-dlp/scraping code nahi; YouTube sirf `server/` (yt-dlp backend) ke through, app `src/sources/youtube.ts` se usse baat karta hai.
2. Har source `MusicSource` interface implement karega (`src/sources/types.ts`).
3. UI (`src/components/**`, `src/app/**`) kisi adapter ko directly import nahi karega. Sirf `@/sources/registry` aur `@/sources/types`.
4. Audio (`expo-audio`) sirf `src/player/` mein import/control hoga (ESLint `no-restricted-imports` enforce karta hai).
5. API keys sirf `.env` mein, `EXPO_PUBLIC_` prefix ke saath. Code mein hardcode nahi. `.env` commit nahi.
6. Sab network calls `src/lib/fetch.ts` ke through.
7. Pura codebase scan mat karo. Jo file chahiye, uska path poochho ya seedha padho.
8. Naya feature: pehle 10-15 line spec (`docs/features/<name>.md`), approval ke baad code.
9. Jawab Hinglish mein, code aur comments English mein. Seedha, bina bhoomika.
10. Session end pe `docs/progress.md` ke liye 5 line summary do.

## Folder structure

```
src/
├── app/         # Expo Router routes; (tabs)/ = Search, Library, Playlists
├── sources/     # ek file = ek adapter; types.ts, registry.ts
├── player/      # engine.ts (expo-audio) + queue.ts (sirf yahan audio)
├── store/       # Zustand stores (sirf state)
├── components/  # UI
└── lib/         # fetch wrapper, storage helpers
docs/
├── architecture.md  # data flow, rules, persistence, build
├── sources.md       # adapter contract + per-source API details
├── progress.md      # done / in progress / next
├── decisions.md     # one-line ADR log
└── features/        # feature specs
```

## Docs pointers

- Architecture aur data flow: `docs/architecture.md`
- `Track` / `MusicSource` contract aur source APIs: `docs/sources.md`
- Status: `docs/progress.md`
- Decisions: `docs/decisions.md`

## Commands

- `npm start` — Metro (dev client ke saath; dev build chahiye, background audio config native hai)
- `npm run android` — native dev build (Android SDK chahiye)
- `npm run lint` / `npm run typecheck` / `npm test` — sab pass hone chahiye before commit
- `npx expo export --platform android` — JS bundle check
- `npm run format` — Prettier
- Tests: Jest + jest-expo, `*.test.ts(x)` files `src/` ke andar, network hamesha mock
