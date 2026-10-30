import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { LiveProgressBar } from '@/components/ProgressBar';
import { SleepTimerSheet, useSleepLabel } from '@/components/SleepTimerSheet';
import { colorFor, radius, spacing, type, useTheme, withAlpha } from '@/components/theme';
import { playerErrorText } from '@/lib/errors';
import { formatDuration } from '@/lib/format';
import { tapHaptic } from '@/lib/haptics';
import {
  cycleRepeat,
  next,
  pause,
  prev,
  resume,
  retry,
  seek,
  seekBy,
  toggleShuffle,
} from '@/player/engine';
import { currentTrack, hasNext } from '@/player/queue';
import { artistKey, SOURCE_LABELS } from '@/sources/registry';
import { useJamStore } from '@/store/jamStore';
import { useIsLiked, useLikedStore } from '@/store/likedStore';
import { usePlayerStore } from '@/store/playerStore';

/** Elapsed time; reads the position itself so the rest of the screen doesn't re-render. */
function LivePosition() {
  const positionSec = usePlayerStore((s) => s.positionSec);
  return <>{formatDuration(positionSec)}</>;
}

export default function PlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const queue = usePlayerStore((s) => s.queue);
  const status = usePlayerStore((s) => s.status);
  const durationSec = usePlayerStore((s) => s.durationSec);
  const error = usePlayerStore((s) => s.error);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const track = currentTrack(queue);
  const jamStatus = useJamStore((s) => s.status);
  const jamCode = useJamStore((s) => s.code);
  const inJam = jamStatus !== 'idle';
  const liked = useIsLiked(track?.id);
  const sleepLabel = useSleepLabel();
  const [sleepOpen, setSleepOpen] = useState(false);

  const close = (
    <IconButton icon="chevron-down" label="Close player" size={26} onPress={() => router.back()} />
  );

  if (!track) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          {close}
          <View style={styles.topText} />
        </View>
        <EmptyState
          icon="musical-notes-outline"
          title="Nothing playing"
          message="Pick a song from Search, or join a friend's Jam."
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
      {/* The cover itself, heavily blurred, gives the screen the song's colours. */}
      <View
        pointerEvents="none"
        style={[styles.fade, { height: height * 0.75, backgroundColor: withAlpha(tint, 0.35) }]}
      >
        {track.artworkUrl ? (
          <Image
            source={{ uri: track.artworkUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            blurRadius={60}
            transition={400}
          />
        ) : null}
        <LinearGradient
          colors={[
            withAlpha(colors.background, 0.35),
            withAlpha(colors.background, 0.7),
            colors.background,
          ]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
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
              {inJam && jamCode ? `Jam · ${jamCode}` : SOURCE_LABELS[track.source]}
            </Text>
            {sleepLabel ? (
              <Text style={[type.micro, { color: colors.accent }]}>
                SLEEP · {sleepLabel.toUpperCase()}
              </Text>
            ) : null}
          </View>
          <IconButton
            icon={sleepLabel ? 'moon' : 'moon-outline'}
            label={sleepLabel ? `Sleep timer: ${sleepLabel}` : 'Sleep timer'}
            size={22}
            color={sleepLabel ? colors.accent : undefined}
            onPress={() => setSleepOpen(true)}
          />
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
          <View style={styles.metaRow}>
            <View style={[styles.meta, styles.metaText]}>
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
            <IconButton
              icon={liked ? 'heart' : 'heart-outline'}
              label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
              size={26}
              color={liked ? colors.accent : colors.textMuted}
              onPress={() => {
                tapHaptic();
                useLikedStore.getState().toggle(track);
              }}
            />
          </View>

          <View>
            <LiveProgressBar onSeek={(s) => void seek(s)} />
            <View style={styles.times}>
              <Text style={[type.caption, styles.time, { color: colors.textMuted }]}>
                <LivePosition />
              </Text>
              <View style={styles.skips}>
                {([-10, 10] as const).map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => void seekBy(d)}
                    disabled={durationSec <= 0}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={d < 0 ? 'Back 10 seconds' : 'Forward 10 seconds'}
                    style={({ pressed }) => [
                      styles.skip,
                      {
                        backgroundColor: colors.surfaceHigh,
                        opacity: durationSec <= 0 ? 0.4 : pressed ? 0.6 : 1,
                      },
                    ]}
                  >
                    {d < 0 ? <Ionicons name="play-back" size={12} color={colors.text} /> : null}
                    <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                      10s
                    </Text>
                    {d > 0 ? <Ionicons name="play-forward" size={12} color={colors.text} /> : null}
                  </Pressable>
                ))}
              </View>
              <Text style={[type.caption, styles.time, { color: colors.textMuted }]}>
                {formatDuration(durationSec)}
              </Text>
            </View>
            {status === 'error' && error ? (
              <Text style={[type.caption, styles.error, { color: colors.danger }]}>
                {playerErrorText(error)}
              </Text>
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
              onPress={() => {
                tapHaptic();
                void prev();
              }}
            />
            <Pressable
              onPress={() => {
                tapHaptic();
                if (status === 'error') void retry();
                else if (playing) pause();
                else resume();
              }}
              disabled={!canToggle && status !== 'error'}
              accessibilityRole="button"
              accessibilityLabel={status === 'error' ? 'Retry' : playing ? 'Pause' : 'Play'}
              accessibilityState={{ disabled: !canToggle && status !== 'error' }}
              style={({ pressed }) => [
                styles.playButton,
                {
                  backgroundColor: colors.accent,
                  opacity:
                    !canToggle && status !== 'loading' && status !== 'error'
                      ? 0.5
                      : pressed
                        ? 0.85
                        : 1,
                },
              ]}
            >
              {status === 'loading' ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : status === 'error' ? (
                <Ionicons name="refresh" size={32} color={colors.onAccent} />
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
              onPress={() => {
                tapHaptic();
                void next();
              }}
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
      <SleepTimerSheet visible={sleepOpen} onClose={() => setSleepOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { flex: 1, paddingHorizontal: spacing.page },
  topBar: { flexDirection: 'row', alignItems: 'center', height: 56, marginHorizontal: -10 },
  topText: { flex: 1, alignItems: 'center' },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  art: { borderRadius: radius.md },
  bottom: { gap: spacing.lg },
  meta: { gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { flex: 1 },
  skips: { flexDirection: 'row', gap: spacing.sm },
  skip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: 999,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -6,
  },
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
