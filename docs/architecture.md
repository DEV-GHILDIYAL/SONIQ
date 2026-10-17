# SONIQ Architecture

## Overview

Free, ad-free music player. Mobile app: Expo (React Native) + TypeScript (strict), Expo Router.
No backend. Android first, builds via EAS (dev build via expo-dev-client; audio engine expo-audio, ADR-008).

## Folder structure

```
src/
├── app/            # Expo Router routes (sirf screens, logic nahi)
│   ├── _layout.tsx
│   └── (tabs)/     # Search, Library, Playlists
├── sources/        # Ek file = ek source adapter
│   ├── types.ts    # Track, MusicSource interface
│   ├── jamendo.ts
│   ├── archive.ts  # Internet Archive
│   ├── fma.ts      # Free Music Archive
│   ├── local.ts    # Device files (expo-document-picker)
│   └── registry.ts # sourceId -> adapter map
├── player/         # engine.ts (expo-audio), queue.ts (pure functions) — sirf yahan audio control
├── store/          # Zustand stores (player state, library, playlists)
├── components/     # UI (source ko directly import nahi karega)
└── lib/            # helpers (fetch wrapper, storage)
```

## Data flow

1. Search screen -> `registry.searchAll(query)` -> har source se `Track[]`.
2. User track tap -> `player.play(track)`.
3. Player `track.source` ke adapter se `getStreamUrl(track)` leta hai.
4. Stream URL (https ya local `file://`) expo-audio player ko diya jata hai (`engine.ts`, ek hi native player reuse hota hai).
5. Queue, shuffle, repeat sirf `player/` mein. Store sirf state rakhta hai.

## Rules

- UI (`src/components/**`, `src/app/**`) kisi adapter ko direct import nahi karta. Sirf registry/types.
- `expo-audio` sirf `src/player/` import karega (ESLint rule).
- Engine stream URL ek injected resolver se leta hai (`setStreamResolver`), registry banne par wahan wire hoga.
- Sab network calls `lib/fetch.ts` ke through (timeout, error handling).

## Persistence

- Playlists, recently played, settings: AsyncStorage (`soniq:*` keys)
- Local audio files: expo-document-picker se pick, expo-file-system se app document directory mein copy; metadata AsyncStorage mein
- API keys: `.env` (`EXPO_PUBLIC_` prefix), kabhi commit nahi. Note: `EXPO_PUBLIC_*` values app bundle mein embed hoti hain, isliye sirf public/free keys.

## Build & distribution

- Dev: `npx expo run:android` ya EAS development build (expo-dev-client)
- Release: EAS Build -> APK/AAB
