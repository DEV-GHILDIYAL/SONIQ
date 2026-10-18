# Backend (Supabase)

One free Supabase project serves three things. Keys: `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` in `.env`.

| Feature | Supabase part | Code |
|---|---|---|
| Jam (listen together) | Realtime broadcast + presence | `src/lib/realtime.ts`, `src/jam/` |
| Listening history | tables `profiles`, `plays` + stats views | `src/lib/listeningSync.ts` |
| Update popup | table `app_releases` + Storage bucket `apk` | `src/lib/updates.ts`, `src/components/UpdatePrompt.tsx` |

## One-time setup
1. Dashboard → SQL Editor → paste `supabase/setup.sql` → Run.
2. Storage → New bucket → name `apk`, **Public** on.

## Security
- The app's anon key has **no direct access** to `profiles` / `plays` (RLS on, no policies, privileges revoked).
- The app can only call `soniq_upsert_profile(id, name, secret)` and `soniq_add_plays(id, secret, rows)`
  (security definer). Each device keeps a private 40-char secret in `profileStore`; the DB stores only its sha256.
- `soniq_add_plays`: max 100 rows per call, 500 plays per user per hour, field lengths/values clamped.
- Stats views are `security_invoker` and revoked from anon: readable only in the dashboard (service role).
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
