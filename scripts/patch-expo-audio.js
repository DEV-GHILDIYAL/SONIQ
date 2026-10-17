/**
 * Patches expo-audio's Android AudioPlayer so the media notification / lock screen shows
 * Next and Previous buttons. Pressing them emits "lockScreenNext" / "lockScreenPrevious" to JS,
 * where src/player/engine.ts moves through SONIQ's own queue. Also makes the seek buttons jump 30 s.
 *
 * Runs on `npm install` (postinstall). Idempotent. Needs a native rebuild to take effect.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioPlayer.kt',
);
const MARK = '// SONIQ-PATCH lock screen next/previous';

if (!fs.existsSync(file)) {
  console.warn('[patch-expo-audio] AudioPlayer.kt not found, skipped');
  process.exit(0);
}
let src = fs.readFileSync(file, 'utf8');
if (src.includes(MARK)) {
  console.log('[patch-expo-audio] already patched');
  process.exit(0);
}

const anchor = `  override val isLive: Boolean
    get() = ref.isCurrentMediaItemLive
`;
if (!src.includes(anchor)) {
  console.warn('[patch-expo-audio] expo-audio changed; patch not applied. Lock screen will lack next/previous.');
  process.exit(0);
}
src = src.replace(
  anchor,
  `${anchor}
  ${MARK}
  override val supportsNextTrack: Boolean
    get() = true
  override val supportsPreviousTrack: Boolean
    get() = true

  override fun nextTrack() {
    emit("lockScreenNext", mapOf<String, Any>())
  }

  override fun previousTrack() {
    emit("lockScreenPrevious", mapOf<String, Any>())
  }
`,
);
src = src.replace(
  'private const val SEEK_JUMP_INTERVAL_MS: Long = 10_000',
  'private const val SEEK_JUMP_INTERVAL_MS: Long = 30_000',
);
fs.writeFileSync(file, src);
console.log('[patch-expo-audio] patched AudioPlayer.kt');
