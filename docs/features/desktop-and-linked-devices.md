# SONIQ for Windows + linked devices (v1.8.0)

## Linked devices (server + app)
- `profile_devices` (extra device secrets per profile) + `soniq_secret_ok` used by every check
  (soniq_check, soniq_verify, add_plays, save_library, feedback, upsert). Original device keeps
  profiles.secret_hash; a backup-code restore still moves the *original* device only.
- `soniq_link_start` (signed-in device, 8-char code, 10 min, single use, max 5 devices),
  `soniq_link_claim` (new device, own fresh secret; returns the account like a restore;
  failures counted globally like restores), `soniq_devices_list`, `soniq_device_remove`.
- Linked devices may rename the profile; they never change the secret/backup code.
- App: Profile → Link a device (`/devices`), Onboarding → "Use my account here too" (`LinkForm`).
  Linked device shows "LINKED DEVICE" instead of the backup code.
- Sync: `soniq_get_library`; before every save and on app foreground, devices pull the cloud
  library and merge additions (liked, playlists, playlist songs). v1 limit: removals on one
  device can come back from the other (no tombstones yet).

## Windows app (Tauri 2)
- Same app: `expo export --platform web` -> `dist-web/`, wrapped by `src-tauri/` (WebView2).
  Release profile: opt-level s, LTO, strip, panic=abort. NSIS, current-user install, WebView2
  bootstrapper (already on Windows 10/11). Linux test build: 9.8 MB binary (~5.7 MB xz).
- Plugins: single-instance (focus existing window), dialog, updater (only when CI has the
  TAURI_UPDATER_PUBKEY secret; checked at start, asks "Update now?", restarts).
- CI job `desktop` (windows-latest, optional): `scripts/desktop-ci-config.js` sets the version
  from app.json and the updater config; uploads SONIQ-Setup-<tag>.exe (+ latest.json).
- Web guards: no APK update popup / background update check, no downloads (stream only),
  DJ natural voice cache needs app storage (falls back to the system voice).
- Not yet: desktop layout (sidebar, wide player), tray, mini player, downloads to disk,
  local music folder, Windows notifications.

## v1.11.0: link by QR
- `pair_requests` + `soniq_pair_start` (new device, own secret hash, 5 min, max 300 open),
  `soniq_pair_approve` (signed-in phone, max 5 devices), `soniq_pair_poll` (new device;
  pending / account / expired; deletes the request once picked up).
- PC: `LinkForm` shows a QR of `soniq://pair/<32-hex token>` (qrcode-generator, no native code)
  and polls every 2 s; the 8-letter code still works below it.
- Phone: `/scan` (expo-camera, QR only, no audio permission) or the phone's own camera app via
  the `soniq://pair/<token>` deep link (`/pair/[token]`). Both ask "Link this PC?" first.
