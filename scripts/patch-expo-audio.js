/**
 * Patches expo-audio's Android code for SONIQ (runs on `npm install` via postinstall; idempotent;
 * needs a native rebuild to take effect). Each patch is applied on its own, so new patches also
 * reach an already-patched node_modules (`node scripts/patch-expo-audio.js`).
 *
 * 1. Notification / lock screen Next + Previous buttons → "lockScreenNext"/"lockScreenPrevious"
 *    events (src/player/engine.ts moves through SONIQ's queue). Seek buttons jump 30 s.
 * 2. Lock screen metadata accepts `durationSec`; the media session uses it when the stream
 *    doesn't report a length (otherwise the notification can sit at 0:00).
 * 3. The notification refreshes on seeks, track changes and when the length becomes known.
 * 4. The first HTTP request for a remote track asks for `Range: bytes=0-`. YouTube
 *    throttles ExoPlayer's un-ranged GET (it stalls at ~512 KB), while a ranged request
 *    returns a normal 206 and streams the whole file. Seeks keep their own Range header.
 */
/* global __dirname */
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', 'node_modules/expo-audio/android/src/main/java/expo/modules/audio');

function patchFile(rel, name, apply) {
  const file = path.join(base, rel);
  if (!fs.existsSync(file)) {
    console.warn(`[patch-expo-audio] ${rel} not found, skipped "${name}"`);
    return;
  }
  const src = fs.readFileSync(file, 'utf8');
  const mark = `SONIQ-PATCH ${name}`;
  if (src.includes(mark)) return;
  const out = apply(src, mark);
  if (out === null) {
    console.warn(`[patch-expo-audio] expo-audio changed; "${name}" not applied.`);
    return;
  }
  fs.writeFileSync(file, out);
  console.log(`[patch-expo-audio] applied "${name}"`);
}

// 1. Next / previous + 10 s seek
patchFile('AudioPlayer.kt', 'lock screen next/previous', (src, mark) => {
  const anchor = `  override val isLive: Boolean
    get() = ref.isCurrentMediaItemLive
`;
  if (!src.includes(anchor)) return null;
  return src
    .replace(
      anchor,
      `${anchor}
  // ${mark}
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
    )
    .replace('private const val SEEK_JUMP_INTERVAL_MS: Long = 30_000', 'private const val SEEK_JUMP_INTERVAL_MS: Long = 10_000');
});

// 2a. Metadata.durationSec
patchFile('AudioRecords.kt', 'metadata duration', (src, mark) => {
  const anchor = `  @Field val artworkUrl: URL?
) : Record`;
  if (!src.includes(anchor)) return null;
  return src.replace(
    anchor,
    `  @Field val artworkUrl: URL?,
  // ${mark}
  @Field val durationSec: Double? = null
) : Record`,
  );
});

// 2b. Media session uses it when the player has no duration
patchFile('service/MetadataInjectingPlayer.kt', 'session duration', (src, mark) => {
  const anchor = `  override fun getMediaMetadata(): MediaMetadata {`;
  if (!src.includes(anchor) || !src.includes('.setArtworkData(null, null)')) return null;
  return src
    .replace('import androidx.media3.common.FlagSet', 'import androidx.media3.common.C\nimport androidx.media3.common.FlagSet')
    .replace(
      '.setArtworkData(null, null)',
      `.setArtworkData(null, null)
      .setDurationMs(injectedDurationMs())`,
    )
    .replace(
      anchor,
      `  // ${mark}
  private fun injectedDurationMs(): Long? {
    val sec = injectedMetadata?.durationSec ?: return null
    return if (sec > 0) (sec * 1000).toLong() else null
  }

  override fun getDuration(): Long {
    val real = super.getDuration()
    return if (real == C.TIME_UNSET || real <= 0) injectedDurationMs() ?: real else real
  }

  override fun getContentDuration(): Long {
    val real = super.getContentDuration()
    return if (real == C.TIME_UNSET || real <= 0) injectedDurationMs() ?: real else real
  }

${anchor}`,
    );
});

// 3. Refresh the notification on more player events
patchFile('service/AudioControlsService.kt', 'notification refresh', (src, mark) => {
  const anchor = `      override fun onPlaybackStateChanged(playbackState: Int) {
        postOrStartForegroundNotification(startInForeground = false)
      }`;
  if (!src.includes(anchor)) return null;
  return src.replace(
    anchor,
    `${anchor}

      // ${mark}
      override fun onPositionDiscontinuity(
        oldPosition: Player.PositionInfo,
        newPosition: Player.PositionInfo,
        reason: Int
      ) {
        postOrStartForegroundNotification(startInForeground = false)
      }

      override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) {
        postOrStartForegroundNotification(startInForeground = false)
      }

      override fun onMediaItemTransition(mediaItem: androidx.media3.common.MediaItem?, reason: Int) {
        postOrStartForegroundNotification(startInForeground = false)
      }`,
  );
});

// 4. First request of a remote stream: Range: bytes=0-
patchFile('AudioModule.kt', 'stream range', (src, mark) => {
  const anchor = `  private fun httpDataSourceFactory(headers: Map<String, String>?): DataSource.Factory {
    return OkHttpDataSource.Factory(httpClient).apply {
      headers?.let { headers ->
        setDefaultRequestProperties(headers)
      }
    }
  }`;
  if (!src.includes(anchor)) return null;
  return src
    .replace(
      'import androidx.media3.common.Player',
      'import androidx.media3.common.C\nimport androidx.media3.common.Player',
    )
    .replace(
      'import androidx.media3.datasource.okhttp.OkHttpDataSource',
      'import androidx.media3.datasource.ResolvingDataSource\nimport androidx.media3.datasource.okhttp.OkHttpDataSource',
    )
    .replace(
      anchor,
      `  private fun httpDataSourceFactory(headers: Map<String, String>?): DataSource.Factory {
    val upstream = OkHttpDataSource.Factory(httpClient)
    if (headers == null) return upstream
    upstream.setDefaultRequestProperties(headers)
    // ${mark}: YouTube throttles an un-ranged GET (it stalls around 512 KB) but answers
    // "bytes=0-" with a normal 206, so the player can stream the whole track. Media3 adds
    // its own Range header on seeks, which is why only position 0 needs the override.
    return ResolvingDataSource.Factory(upstream) { dataSpec ->
      if (dataSpec.position == 0L && dataSpec.length == C.LENGTH_UNSET.toLong()) {
        dataSpec.buildUpon()
          .setHttpRequestHeaders(dataSpec.httpRequestHeaders + ("Range" to "bytes=0-"))
          .build()
      } else {
        dataSpec
      }
    }
  }`,
    );
});
