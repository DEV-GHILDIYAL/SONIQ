import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { playerErrorText } from '@/lib/errors';
import { pressHaptic, tapHaptic } from '@/lib/haptics';
import { next, pause, prev, resume, retry } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { usePlayerStore } from '@/store/playerStore';
import { Artwork } from './Artwork';
import { IconButton } from './IconButton';
import { LiveProgressBar } from './ProgressBar';
import { MINI_PLAYER_HEIGHT, radius, spacing, type, useTheme } from './theme';

/** How far (px) the card must be dragged sideways to skip. */
const SWIPE_SKIP = 70;

/** Sideways drag on the card: left = next song, right = previous. Taps still work. */
function useSwipeToSkip() {
  const [x] = useState(() => new Animated.Value(0));
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only claim clearly horizontal drags so taps and the tab bar scroll keep working.
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_, g) => x.setValue(Math.max(-120, Math.min(120, g.dx))),
        onPanResponderRelease: (_, g) => {
          const skip =
            g.dx <= -SWIPE_SKIP || g.vx < -0.8
              ? 'next'
              : g.dx >= SWIPE_SKIP || g.vx > 0.8
                ? 'prev'
                : null;
          if (skip) {
            pressHaptic();
            void (skip === 'next' ? next() : prev());
          }
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [x],
  );
  const opacity = x.interpolate({ inputRange: [-120, 0, 120], outputRange: [0.55, 1, 0.55] });
  return { handlers: responder.panHandlers, style: { transform: [{ translateX: x }], opacity } };
}

/** Floating now-playing card above the tab bar. Renders nothing when the queue is empty. */
export function MiniPlayer() {
  const router = useRouter();
  const { colors } = useTheme();
  const track = usePlayerStore((s) => currentTrack(s.queue));
  const status = usePlayerStore((s) => s.status);
  const error = usePlayerStore((s) => s.error);
  const swipe = useSwipeToSkip();

  if (!track) return null;

  const playing = status === 'playing';
  const canToggle = status === 'playing' || status === 'paused';

  return (
    <Animated.View
      {...swipe.handlers}
      style={[
        styles.wrap,
        { backgroundColor: colors.surfaceHigh, borderColor: colors.border },
        swipe.style,
      ]}
      testID="mini-player"
    >
      <Pressable
        onPress={() => router.push('/player')}
        accessibilityRole="button"
        accessibilityLabel={`Now playing: ${track.title}. Open player`}
        style={styles.row}
      >
        <Artwork seed={track.id} uri={track.artworkUrl} size={42} />
        <View style={styles.text}>
          <Text numberOfLines={1} style={[type.caption, styles.title, { color: colors.text }]}>
            {track.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[type.caption, { color: status === 'error' ? colors.danger : colors.textMuted }]}
          >
            {status === 'error' && error ? playerErrorText(error) : track.artist}
          </Text>
        </View>
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
          hitSlop={6}
          style={({ pressed }) => [
            styles.play,
            {
              backgroundColor: colors.accent,
              opacity:
                !canToggle && status !== 'loading' && status !== 'error' ? 0.45 : pressed ? 0.8 : 1,
            },
          ]}
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : status === 'error' ? (
            <Ionicons name="refresh" size={20} color={colors.onAccent} />
          ) : (
            <Ionicons name={playing ? 'pause' : 'play'} size={20} color={colors.onAccent} />
          )}
        </Pressable>
        <IconButton
          icon="play-skip-forward"
          label="Next"
          size={22}
          onPress={() => {
            tapHaptic();
            void next();
          }}
        />
      </Pressable>
      <View style={styles.progress}>
        <LiveProgressBar thin />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: MINI_PLAYER_HEIGHT,
    marginHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    gap: spacing.md,
  },
  text: { flex: 1 },
  title: { fontWeight: '700' },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: 0 },
});
