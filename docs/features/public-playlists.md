# Public playlists (v1.5.0)

1. Every playlist is Private (phone only) until the owner taps the Private/Public pill on its page.
2. Public = a copy in Supabase `public_playlists`, managed only through `soniq_playlist_*` functions (RLS on, no direct table access).
3. Only the owner can change it (`owner_id = p_id` + device secret check). Edits are pushed automatically 3 s after any change (also ones made offline); deleting the local playlist deletes the public copy.
4. Songs from the phone (`source: 'local'`) are never published. Limits: 50 public playlists per user, 500 songs, name 60 chars, ~400 KB.
5. Anyone can read (`soniq_playlist_get`, `soniq_playlist_discover` trending/new/search). The owner's display name is shown.
6. Others can play, shuffle, share and "Save" (a private copy in their library, marked "from <owner>"). They cannot add songs to the original.
7. Plays and saves count once per user per playlist per day (`public_playlist_events`); the owner's own plays don't count.
8. Report: one per user per playlist, stored in `public_playlist_reports` for review.
9. Screens: Search › Community playlists row → `/community` (Trending | New + search) → `/community/[id]`. Share links: `…/functions/v1/invite?playlist=<uuid>` → `soniq://community/<uuid>`.
