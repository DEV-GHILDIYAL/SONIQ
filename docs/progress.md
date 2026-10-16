# SONIQ Progress

Last updated: 2026-10-16

## Done
- [x] Docs baseline (CLAUDE.md, docs/)

## In progress
- [ ] Project scaffold (Expo + Router + TS)

## Next
- [ ] Track + MusicSource types (src/sources/types.ts)
- [ ] Player module (react-native-track-player: setup, playback service, queue, play, next, prev)
- [ ] Jamendo adapter
- [ ] Internet Archive adapter
- [ ] Search screen
- [ ] Local files adapter (document-picker + file-system)
- [ ] Playlists (AsyncStorage)
- [ ] EAS dev build + Android APK

## Decisions (short) — details: docs/decisions.md
- Mobile app: Expo (React Native) + TS + Expo Router. (Pehle Vite web tha, ab superseded.)
- Audio: react-native-track-player, isliye dev build chahiye (Expo Go nahi).
- Tests: Jest + jest-expo.
- YouTube nahi (ToS). Sirf free/licensed sources.
- Spotify optional, baad mein.
- Koi backend nahi (abhi).

## Notes for next session
- (session end pe 3-5 line yahan likho)
