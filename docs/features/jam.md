# Feature: Jam (listen together)

**Goal:** Spotify-Jam style: friends on different phones hear the same song at the same moment.

1. Relay: **Supabase Realtime** (free tier, websockets, no own server). Room = channel `jam:<CODE>`. Keys in `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`), baked into the APK.
2. Host taps "Start Jam" on the player -> 6-char code + share sheet (WhatsApp). Friend: "Join Jam" -> enters code.
3. Host broadcasts `state` {track, positionSec, playing, hostTime} on every play/pause/seek/track change + heartbeat every 5 s.
4. Guest: loads the same track itself (YouTube on-device / Jamendo / Archive), then seeks to `positionSec + elapsed`. Clock offset measured with ping/pong at join.
5. Drift > 1.5 s -> guest re-seeks. Host pauses -> everyone pauses.
6. v1 control: host controls playback; guests can **add songs to the queue** (request -> host appends, everyone sees the queue).
7. Members list via Supabase Presence (name + avatar initial). Host leaves -> Jam ends for all.
8. Local files can't be shared: host gets a toast, guests skip that track.
9. Code: `src/jam/` (session, sync math), `src/store/jamStore.ts`, `src/components/JamSheet.tsx`, Jam button on `src/app/player.tsx`. Guests drive the player only through `src/player/engine` (no expo-audio outside src/player).
10. Tests: sync/offset math, message handling with a mocked channel, guest follows host state.

**Needs from Dev:** free Supabase project (2 min) -> URL + anon key.
**Risk:** first YouTube load on the guest takes ~1-2 s; compensated by seeking after load.
