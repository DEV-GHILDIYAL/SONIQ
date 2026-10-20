# Backend (Supabase)

One free Supabase project serves a few things. Keys: `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` in `.env`.

| Feature | Supabase part | Code |
|---|---|---|
| Jam (listen together) | Realtime broadcast + presence | `src/lib/realtime.ts`, `src/jam/` |
| Listening history | tables `profiles`, `plays` + stats views | `src/lib/listeningSync.ts` |
| Update popup | table `app_releases` + Storage bucket `apk` | `src/lib/updates.ts`, `src/components/UpdatePrompt.tsx` |
| Profile photo | Storage bucket `avatars` (public) + URL in the library backup | `src/lib/avatar.ts`, `src/lib/cloudBackup.ts` |

## One-time setup
1. Dashboard → SQL Editor → paste `supabase/setup.sql` → Run. This also creates the public
   `avatars` bucket and lets the app upload/replace profile photos.
2. Storage → New bucket → name `apk`, **Public** on (release APK links).

## Security
- The app's anon key has **no direct access** to `profiles` / `plays` (RLS on, no policies, privileges revoked).
- The app can only call `soniq_upsert_profile(id, name, secret)` and `soniq_add_plays(id, secret, rows)`
  (security definer). Each device keeps a private 40-char secret in `profileStore`; the DB stores only its sha256.
- `soniq_add_plays`: max 100 rows per call, 500 plays per user per hour, field lengths/values clamped.
- Stats views are `security_invoker` and revoked from anon: readable only in the dashboard (service role).
- The `avatars` bucket is public-read and accepts anon uploads/updates (the app has no login).
  Photos live at `<profile id>/avatar.<ext>`; anyone with the anon key could upload to it, but the
  URL is only stored in that profile's backup. Keep the bucket size limits in mind.
- Recommendations later: add another function that returns only the caller's own data (checked by secret).

## Listening history
Every play is stored locally (`profileStore.history`) and queued in a persisted outbox (`syncStore`), then sent via `soniq_add_plays` in batches (offline-safe). Genre is filled when the song came from a genre search (`playContext.tagGenre`).
Stats: `user_track_stats` (how many times each song), `user_artist_stats`, `user_genre_stats`.

## Releasing an update
1. Bump `"version"` (and `android.versionCode`) in `app.json`, then `npx expo prebuild --platform android` and `gradlew assembleRelease`.
2. Storage → `apk` bucket → upload `app-release.apk` (e.g. as `soniq-1.2.0.apk`) → copy its public URL.
3. SQL Editor:
   `insert into app_releases (version, notes, apk_url) values ('1.2.0', '• Lyrics\n• Bug fixes', '<public url>');`
Old builds show the popup on next launch; "Later" hides it for 3 days.

## One-tap restore link
- Edge Function `restore` (`supabase/functions/restore/index.ts`): `GET /functions/v1/restore?id=…&code=…`
  validates the format and 302-redirects to `intent://restore?…#Intent;scheme=soniq;package=com.anonymous.soniq;end`.
  It never touches the database; the app's `/restore` screen asks "Use this account?" and calls `soniq_restore`.
- Deploy once with **JWT verification off** (a browser opens the link without a token):
  Dashboard → Edge Functions → Deploy a new function → Via editor → name `restore` → paste the file → Deploy →
  function Settings → turn off "Verify JWT". Or: `npx supabase functions deploy restore --no-verify-jwt --project-ref <ref>`.
- The ID + code appear in the URL, so they can show up in your own Edge Function logs (only you can see those).

## Friend invite link
Edge Function `invite` (`supabase/functions/invite/index.ts`) redirects
`/functions/v1/invite?id=SQ-…&name=…` to `soniq://friend?...` and `?jam=CODE` to `soniq://jam?code=CODE`. Deploy like `restore`: **Verify JWT OFF**.
Friend data lives in `friend_requests`, `friends`, `blocks` and is only reachable through `soniq_friend_*` functions.

Public Jams: table `jams` (one row per listener, only for public Jams), RPCs `soniq_jam_announce` / `soniq_jam_end`; friends read it via `soniq_friends_list`.
