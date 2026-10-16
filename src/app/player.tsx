import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Artwork } from '@/components/Artwork';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { ProgressBar } from '@/components/ProgressBar';
import { colorFor, radius, spacing, type, useTheme, withAlpha } from '@/components/theme';
import { formatDuration } from '@/lib/format';
import { cycleRepeat, next, pause, prev, resume, seek, toggleShuffle } from '@/player/engine';
import { currentTrack, hasNext } from '@/player/queue';
import { artistKey, SOURCE_LABELS } from '@/sources/registry';
import { usePlayerStore } from '@/store/playerStore';

/** Number of bands in the top tint fade (no native gradient module needed). */
const FADE_STEPS = 16;

export default function PlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const queue = usePlayerStore((s) => s.queue);
  const status = usePlayerStore((s) => s.status);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const durationSec = usePlayerStore((s) => s.durationSec);
  const error = usePlayerStore((s) => s.error);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const track = currentTrack(queue);

  const close = (
    <IconButton icon="chevron-down" label="Close player" size={26} onPress={() => router.back()} />
  );

  if (!track) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.topBar}>{close}</View>
        <EmptyState
          icon="musical-notes-outline"
          title="Nothing playing"
          message="Pick a song from Search."
        />
      </View>
    );
  }

  const tint = colorFor(track.id);
  const artSize = Math.min(width - spacing.page * 2, height * 0.42, 380);
  const playing = status === 'playing';
  const canToggle = status === 'playing' || status === 'paused';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Artwork-coloured wash at the top, fading into the page background. */}
      <View pointerEvents="none" style={[styles.fade, { height: height * 0.6 }]}>
        {Array.from({ length: FADE_STEPS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.band,
              { backgroundColor: withAlpha(tint, 0.45 * (1 - i / (FADE_STEPS - 1))) },
            ]}
          />
        ))}
      </View>

      <View
        style={[
          styles.content,
          { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <View style={styles.topBar}>
          {close}
          <View style={styles.topText}>
            <Text style={[type.micro, { color: colors.textMuted }]}>PLAYING FROM</Text>
            <Text
              style={[type.caption, { color: colors.text, fontWeight: '700' }]}
              numberOfLines={1}
            >
              {SOURCE_LABELS[track.source]}
            </Text>
          </View>
          <IconButton
            icon="list"
            label="Open queue"
            size={24}
            onPress={() => router.push('/queue')}
          />
        </View>

        <View style={styles.artWrap}>
          <Artwork seed={track.id} uri={track.artworkUrl} size={artSize} style={styles.art} />
        </View>

        <View style={styles.bottom}>
          <View style={styles.meta}>
            <Text style={[type.title, { color: colors.text }]} numberOfLines={1}>
              {track.title}
            </Text>
            <Text
              style={[type.body, { color: colors.textMuted }]}
              numberOfLines={1}
              onPress={() => {
                const key = artistKey(track);
                if (key)
                  router.push({
                    pathname: '/artist/[id]',
                    params: { id: key, name: track.artist },
                  });
              }}
            >
              {track.artist}
              {track.album ? ` · ${track.album}` : ''}
            </Text>
          </View>

          <View>
            <ProgressBar
              positionSec={positionSec}
              durationSec={durationSec}
              onSeek={(s) => void seek(s)}
            />
            <View style={styles.times}>
              <Text style={[type.caption, styles.time, { color: colors.textMuted }]}>
                {formatDuration(positionSec)}
              </Text>
              <Text style={[type.caption, styles.time, { color: colors.textMuted }]}>
                {formatDuration(durationSec)}
              </Text>
            </View>
            {status === 'error' && error ? (
              <Text style={[type.caption, styles.error, { color: colors.danger }]}>{error}</Text>
            ) : null}
          </View>

          <View style={styles.controls}>
            <IconButton
              icon="shuffle"
              label={shuffle ? 'Shuffle on' : 'Shuffle off'}
              size={24}
              color={shuffle ? colors.accent : colors.textMuted}
              onPress={toggleShuffle}
            />
            <IconButton
              icon="play-skip-back"
              label="Previous"
              size={32}
              onPress={() => void prev()}
            />
            <Pressable
              onPress={playing ? pause : resume}
              disabled={!canToggle}
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Play'}
              accessibilityState={{ disabled: !canToggle }}
              style={({ pressed }) => [
                styles.playButton,
                {
                  backgroundColor: colors.accent,
                  opacity: !canToggle && status !== 'loading' ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
            >
              {status === 'loading' ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Ionicons
                  name={playing ? 'pause' : 'play'}
                  size={34}
                  color={colors.onAccent}
                  style={playing ? undefined : styles.playIconNudge}
                />
              )}
            </Pressable>
            <IconButton
              icon="play-skip-forward"
              label="Next"
              size={32}
              disabled={!hasNext(queue) && repeat !== 'all'}
              onPress={() => void next()}
            />
            <View>
              <IconButton
                icon="repeat"
                label={`Repeat ${repeat}`}
                size={24}
                color={repeat === 'off' ? colors.textMuted : colors.accent}
                onPress={cycleRepeat}
              />
              {repeat === 'one' ? (
                <Text style={[styles.repeatOne, { color: colors.accent }]}>1</Text>
              ) : null}
            </View>
          </View>

          <Text style={[type.caption, styles.queueInfo, { color: colors.textFaint }]}>
            {queue.index + 1} of {queue.tracks.length} in queue
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.page },
  topBar: { flexDirection: 'row', alignItems: 'center', height: 56, marginHorizontal: -10 },
  topText: { flex: 1, alignItems: 'center' },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  art: { borderRadius: radius.md },
  bottom: { gap: spacing.lg },
  meta: { gap: 2 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  time: { fontVariant: ['tabular-nums'] },
  error: { textAlign: 'center', marginTop: spacing.sm },
  // Outer icons sit on the page gutter (IconButton has a 44px box).
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: -10,
  },
  repeatOne: { position: 'absolute', right: 8, top: 6, fontSize: 10, fontWeight: '800' },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconNudge: { marginLeft: 4 },
  queueInfo: { textAlign: 'center' },
});
