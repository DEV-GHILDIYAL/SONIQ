# SONIQ Progress

Last updated: 2026-10-16

## Done

- [x] Docs baseline (CLAUDE.md, docs/)
- [x] Player engine switch: RNTP -> expo-audio (ADR-008)
- [x] src/player/engine.ts (play, playQueue, pause, resume, seek, next, prev) + src/player/queue.ts + src/store/playerStore.ts
- [x] expo-audio plugin config: iOS UIBackgroundModes audio, Android FOREGROUND_SERVICE_MEDIA_PLAYBACK
- [x] Engine mock tests + queue tests (Jest)

## In progress

- [ ] Project scaffold (Expo + Router + TS)
- [ ] Native dev build verify (`npx expo run:android`) — user khud chalayega

## Next

- [ ] Track + MusicSource types (src/sources/types.ts)
- [ ] Source registry + `setStreamResolver(registry.getStreamUrl)` wire karna
- [ ] Lock screen controls (`player.setActiveForLockScreen`) — alag feature, spec pehle. Note: Android pe iske bina background play ~3 min baad ruk sakta hai
- [ ] Jamendo adapter
- [ ] Internet Archive adapter
- [ ] Search screen
- [ ] Local files adapter (document-picker + file-system)
- [ ] Playlists (AsyncStorage)
- [ ] EAS dev build + Android APK

## Decisions (short) — details: docs/decisions.md

- Mobile app: Expo (React Native) + TS + Expo Router. (Pehle Vite web tha, ab superseded.)
- Audio: expo-audio (ADR-008; RNTP 4.1.2 Kotlin 2.2 pe compile fail). Dev build abhi bhi chahiye (expo-dev-client).
- Tests: Jest + jest-expo.
- YouTube personal use only (on-device, store build mein nahi).
- Spotify optional, baad mein.
- Koi backend nahi (abhi).

## Notes for next session

- RNTP hata ke expo-audio lagaya; engine.ts + queue.ts + playerStore ready, 17 tests pass.
- Engine abhi kisi screen se import nahi hai, isliye export bundle mein shamil nahi; registry ke baad wire karna.
- Lock screen controls next feature; Android sustained background play ke liye zaroori hai.
- `android/` folder purane RNTP prebuild ka hai: `npx expo prebuild --clean` ya `npx expo run:android` se regenerate karna.
- Windows pe `npm install` chalana hai (lockfile update hua hai).
