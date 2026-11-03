/**
 * CI helper for the Windows build (Tauri). Writes src-tauri/ci.conf.json, merged into
 * tauri.conf.json by `tauri build --config`:
 *  - version: same as the Android app (app.json), so one tag = one version everywhere;
 *  - auto-update (only when the TAURI_UPDATER_PUBKEY secret exists): updater endpoint on
 *    GitHub Releases + signed update artifacts.
 * With --latest it instead writes latest.json (the updater's "what's newest" file).
 */
/* global __dirname */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = require(path.join(root, 'app.json')).expo;
const repo = 'DEV-GHILDIYAL/SONIQ';

if (process.argv.includes('--latest')) {
  const [exe, sig, out] = process.argv.slice(3);
  const tag = process.env.TAG;
  const notesFile = path.join(root, 'docs/changelog', `${tag}.md`);
  const latest = {
    version: app.version,
    notes: fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : '',
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature: fs.readFileSync(sig, 'utf8').trim(),
        url: `https://github.com/${repo}/releases/download/${tag}/${path.basename(exe)}`,
      },
    },
  };
  fs.writeFileSync(out, JSON.stringify(latest, null, 2));
  console.log(`latest.json -> ${latest.version}`);
  process.exit(0);
}

const pubkey = (process.env.TAURI_UPDATER_PUBKEY || '').trim();
const conf = { version: app.version };
if (pubkey) {
  conf.bundle = { createUpdaterArtifacts: true };
  conf.plugins = {
    updater: {
      pubkey,
      endpoints: [`https://github.com/${repo}/releases/latest/download/latest.json`],
      windows: { installMode: 'passive' },
    },
  };
}
fs.writeFileSync(path.join(root, 'src-tauri', 'ci.conf.json'), JSON.stringify(conf, null, 2));
console.log(
  `Desktop ${app.version}, auto-update ${pubkey ? 'ON' : 'OFF (no TAURI_UPDATER_PUBKEY)'}`,
);
