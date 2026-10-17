# Profile + Jam tab + Library merge

## Tabs
Home · Search · Jam · Library · Profile. The old Playlists tab is merged into Library
(chips: All / Playlists / On this device; rename/delete via the row's ⋯ menu).
`(tabs)/playlists.tsx` stays as a hidden route (`href: null`); safe to delete.

## Jam tab
`JamPanel` (was the JamSheet modal) renders in `(tabs)/jam.tsx`. Home/Player Jam buttons navigate to `/jam`.
Jam display name = profile name (fallback: old jamStore.myName).

## Profile
- `src/store/profileStore.ts` (persisted `soniq:profile`): `profile {id "SQ-XXXX-XXXX", name, createdAt}`,
  `plays`, `artistCounts`, `sourceCounts`, `genreCounts`, `history` (last 200 plays).
- First launch: `Onboarding` (root layout) asks for a name, then `createProfile`.
- `engine` calls `recordPlay(track)` after each successful play; Home genre tiles call `recordGenre`.
- Local only for now. Next: recommendations from top artists/genres (e.g. search "<top artist> mix" across sources).
