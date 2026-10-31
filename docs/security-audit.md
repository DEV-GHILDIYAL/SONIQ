# Security & bug audit (v1.6.1, 2026-10-31)

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | Groq API key shipped inside every APK (`EXPO_PUBLIC_GROQ_API_KEY`), extractable; anyone could burn the quota | **Fixed**: `ai` Edge Function holds the key (Supabase secret), checks ID + device secret, 80 calls/user/day (`ai_usage`, `soniq_ai_take`) |
| 2 | High | Avatars bucket: anon could upload/overwrite ANY file (replace other users' photos, host arbitrary files) | **Fixed**: anon write policies removed; `avatar` Edge Function hands out a signed upload URL for `<own id>/avatar.<ext>` only; bucket limited to images, 2 MB; app shrinks photos to 512 px |
| 3 | High | CI releases signed with React Native's public debug key | **Ready**: workflow signs with the release key once `SIGNING_*` secrets exist, and reports which key signed. Needs one reinstall for existing users (docs/release-signing.md) |
| 4 | Medium | IDs, device secrets, backup codes and Jam codes used `Math.random` (predictable) | **Fixed**: `expo-crypto` secure random (`src/lib/secureRandom.ts`) |
| 5 | Medium | Jam: any member can send host-only messages (state/end/kick); broadcasts carry no verified sender | **Open**: needs Supabase Auth + Realtime Authorization (private channels). Codes are private, so risk is limited to people already in the Jam |
| 6 | Medium | Device secret and backup code stored in plain AsyncStorage | **Open**: move to `expo-secure-store` (needs a migration) |
| 7 | Low | No rate limit on profile creation (spam accounts) | **Open**: needs an Edge Function in front of `soniq_upsert_profile` (IP rate limit) |
| 8 | Low | Deleting a public playlist while offline leaves its community copy | **Open**: retry unpublish on next start |
| 9 | Bug | AI "Add similar songs" counted as the user adding songs → skewed taste / mixes | **Fixed** (`withoutTasteSignals`) |
| 10 | Bug | Lock-screen length not refreshed after the download fallback (`retryWithDownload`) | **Fixed** |
| 11 | Bug | Unit tests fail in CI (non-blocking job) after recent changes | **Open**: needs the test output |

Checked and fine: all tables have RLS with no anon policies (data only through `soniq_*` functions
that verify the device secret); size limits and rate limits on plays, library backup, feedback,
clans and public playlists; restore has a delay on wrong codes; no secrets in git history
(gitleaks allowlist only covers the public Supabase anon key); npm audit: 0 critical.

## VAPT report (2026-10-31) mapping

| VAPT | Finding | Status in v1.6.1 |
|---|---|---|
| F1 | Groq key in APK | Fixed: `ai` Edge Function + daily limit. Rotate the old key in the Groq console |
| F2 | `Math.random` tokens + no restore lockout | Fixed: `expo-crypto` secure random; `soniq_restore_v2` locks an ID after 5 wrong codes/hour (200/hour globally). Old `soniq_restore` disabled (it raised on failure, which rolled back the failure count). Existing backup codes keep working; codes made by new installs are secure |
| F3 | Avatar bucket anon write | Fixed: `avatar` Edge Function signed uploads, images ≤ 2 MB |
| F4 | `server/` (yt-dlp proxy) key + no rate limit | Not changed: the app builds don't use `server/` (`EXPO_PUBLIC_SONIQ_SERVER_URL` is empty in `.env` and CI). Keep it undeployed, or shut down any running copy |
| F5 | Backup code inside the restore link | Accepted: the link IS the backup (it must still work after a reinstall, months later), so it has to carry a credential, like a password-reset link. Mitigated by the lockout, `no-store`/`no-referrer`, and the "keep private" text. Only the project owner can read Edge Function logs |
| F6 | Dependencies | `zod` 3.x (via `@expo/cli`, `eslint-plugin-react-hooks`) has no fixed 3.x version; `npm audit fix` rewrites ~3,800 lockfile lines and still leaves it. Build/dev tooling only, not shipped in the APK. `node-forge` fixed via override. `server/` deps: see F4 |
| F7 | Unlimited profile creation | Fixed: max 300 new profiles/hour overall; profiles without a secret can no longer be claimed by anyone |
| F8 | `server/` info disclosure | Not changed (see F4) |
