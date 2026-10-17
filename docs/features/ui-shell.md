# Feature: UI shell (full app UI)

**Goal:** Saari screens real UI ke saath: dark-first theme, tab icons, mini player + full player, har screen pe empty/loading/error states. Player `playerStore` + `engine` se wired.

**Files (new / changed):**

- `src/components/theme.ts` — color tokens (dark + light), spacing, typography; `useTheme()` hook
- `src/components/` — `TrackRow`, `SearchBar`, `Chip`, `EmptyState`, `IconButton`, `ProgressBar` (tap-to-seek), `MiniPlayer`
- `src/sources/registry.ts` — `sources[]`, `searchAll(query, sourceIds?)`, `getStreamUrl(track)`; abhi koi adapter registered nahi (empty list)
- `src/app/_layout.tsx` — theme, SafeArea, `setStreamResolver(registry.getStreamUrl)`, `player` modal route
- `src/app/(tabs)/_layout.tsx` — themed tab bar + icons (`@expo/vector-icons`), MiniPlayer tabs ke upar
- `src/app/(tabs)/index.tsx` — Search: debounced input, source chips (All/Jamendo/Archive/FMA/Local), results list, states
- `src/app/(tabs)/library.tsx` — "Import local files" button (disabled, "coming soon"), recently played list (empty state)
- `src/app/(tabs)/playlists.tsx` + `src/store/playlistStore.ts` — create / rename / delete playlist, AsyncStorage persist
- `src/app/player.tsx` — full player: artwork, title/artist, progress + seek, prev / play-pause / next

**Acceptance criteria:**

1. `npm run lint`, `typecheck`, `test`, `npx expo export --platform android` pass.
2. Tests: TrackRow, MiniPlayer (hidden jab queue empty), Search states (empty/no results/error), playlistStore.
3. UI sirf `@/sources/registry` / `types` import kare; `expo-audio` sirf `src/player/`.
4. Light aur dark dono mode readable; touch targets >= 44px.

**Out of scope:** Jamendo/Archive/FMA/local adapters, local file import logic, lock-screen controls, playlist mein tracks add karna.

## Revision 1 (2026-10-16): SONIQ look, not a Spotify clone

User reference se inspiration (copy nahi): deep indigo background (`#0D0C24`), violet accent (`#7B6CFF`), rounded cards (radius 12-26), soft glow.

- Naya **Home** tab (`src/app/(tabs)/index.tsx`): greeting, hero line, search pill, Recently played carousel, Your playlists, Explore genres, Up next.
- Search ab `src/app/(tabs)/search.tsx` pe; Home se `?q=<genre>` param leta hai.
- Floating icon-only tab bar (Home / Search / Library / Playlists), active icon violet + dot.
- `src/store/recentStore.ts` (AsyncStorage, max 20) — sirf `player/engine.ts` likhta hai, successful play pe.
- Player: rounded-square glowing play button, side buttons on cards, color blobs from track tint.
- Shuffle / repeat / like jaan-boojh ke nahi dikhaye: engine support nahi karta, fake buttons nahi.

## Revision 2 (2026-10-16): warm dark (amber), user choice

- Palette: charcoal `#121110`, cards `#1E1C1A`, text `#F5F1EA`, accent amber `#FF8A3D`. Blue/purple, blobs, glow hata diye.
- Notch fix: `src/components/Screen.tsx` har top-level screen ko solid status-bar strip deta hai; scroll content uske neeche clip hota hai.
- Ek hi gutter `spacing.page = 20` sab screens pe; docked tab bar (labels ke saath), mini player uske upar.
- Playlist detail: fixed top bar (back), title + count + play button ek row mein.
