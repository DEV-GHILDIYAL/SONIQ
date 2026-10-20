import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { next, pause, resume } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { usePlayerStore } from '@/store/playerStore';
import { Artwork } from './Artwork';
import { IconButton } from './IconButton';
import { LiveProgressBar } from './ProgressBar';
import { MINI_PLAYER_HEIGHT, radius, spacing, type, useTheme } from './theme';

/** Floating now-playing card above the tab bar. Renders nothing when the queue is empty. */
export function MiniPlayer() {
  const router = useRouter();
  const { colors } = useTheme();
  const track = usePlayerStore((s) => currentTrack(s.queue));
  const status = usePlayerStore((s) => s.status);
  const error = usePlayerStore((s) => s.error);

  if (!track) return null;

  const playing = status === 'playing';
  const canToggle = status === 'playing' || status === 'paused';

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
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
            {status === 'error' && error ? error : track.artist}
          </Text>
        </View>
        <Pressable
          onPress={playing ? pause : resume}
          disabled={!canToggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          accessibilityState={{ disabled: !canToggle }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.play,
            {
              backgroundColor: colors.accent,
              opacity: !canToggle && status !== 'loading' ? 0.45 : pressed ? 0.8 : 1,
            },
          ]}
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Ionicons name={playing ? 'pause' : 'play'} size={20} color={colors.onAccent} />
          )}
        </Pressable>
        <IconButton icon="play-skip-forward" label="Next" size={22} onPress={() => void next()} />
      </Pressable>
      <View style={styles.progress}>
        <LiveProgressBar thin />
      </View>
    </View>
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
