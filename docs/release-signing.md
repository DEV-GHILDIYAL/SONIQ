# Release signing (CI)

Until the four secrets below exist, GitHub Actions signs the APK with React Native's
**public debug key** (the same key in every React Native project). Anyone can sign an APK
with it, and Android would install that APK as an "update" over SONIQ.

## One-time setup (on the laptop that has `credentials\`)

1. Open `credentials\signing.properties` to see `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
2. Copy the keystore as base64 (PowerShell, in the SONIQ folder):
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("credentials\soniq-release.keystore")) | Set-Clipboard
   ```
   (use the real file name from `storeFile`).
3. GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:
   - `SIGNING_KEYSTORE_BASE64` = paste
   - `SIGNING_STORE_PASSWORD`, `SIGNING_KEY_ALIAS`, `SIGNING_KEY_PASSWORD` = from the file
4. Next release: the run summary says "🔐 Signed with the SONIQ release key".

## The switch is one-way (read before doing it)

Android only installs an update signed with the same key as the installed app. Everyone who
has a debug-key build must **reinstall once**:

1. In the old app: Profile → Account backup → copy the SONIQ ID + backup code (or Share).
2. Uninstall SONIQ, install the new APK from the GitHub release.
3. Onboarding → "I already have an account" → ID + backup code. Library, playlists and
   likes come back from the cloud backup; downloads must be downloaded again.

After that, in-app updates work again as before. Never lose the keystore or its passwords:
without them no future update can be installed over the app.
