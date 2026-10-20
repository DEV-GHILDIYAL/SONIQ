import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { TrackRow } from '@/components/TrackRow';
import { spacing, type, useTheme } from '@/components/theme';
import { openTrackActions } from '@/components/trackActionsStore';
import { clearQueue, jumpTo, moveInQueue, removeFromQueue } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { usePlayerStore } from '@/store/playerStore';
import { LIST_PERF } from '@/components/listPerf';

/** Now playing + Up next, with jump / reorder / remove. */
export default function QueueScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const queue = usePlayerStore((s) => s.queue);
  const current = currentTrack(queue);
  const upcoming = queue.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ index }) => index > queue.index);

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton
          icon="chevron-down"
          label="Close queue"
          size={26}
          onPress={() => router.back()}
        />
        <Text
          accessibilityRole="header"
          style={[type.heading, styles.title, { color: colors.text }]}
        >
          Queue
        </Text>
        {upcoming.length > 0 ? (
          <Pressable
            onPress={clearQueue}
            accessibilityRole="button"
            hitSlop={10}
            style={styles.clear}
          >
            <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>Clear</Text>
          </Pressable>
        ) : (
          <View style={styles.clear} />
        )}
      </View>

      {!current ? (
        <EmptyState
          icon="list-outline"
          title="Queue is empty"
          message="Play something to start a queue."
        />
      ) : (
        <FlatList
          {...LIST_PERF}
          data={upcoming}
          keyExtractor={({ track }) => track.id}
          ListHeaderComponent={
            <>
              <Text style={[type.micro, styles.section, { color: colors.textMuted }]}>
                NOW PLAYING
              </Text>
              <TrackRow track={current} active onMore={openTrackActions} />
              <Text style={[type.micro, styles.section, { color: colors.textMuted }]}>
                {upcoming.length > 0 ? `UP NEXT · ${upcoming.length}` : 'UP NEXT'}
              </Text>
            </>
          }
          renderItem={({ item: { track, index }, index: i }) => (
            <TrackRow
              track={track}
              onPress={() => void jumpTo(index)}
              right={
                <View style={styles.controls}>
                  <IconButton
                    icon="chevron-up"
                    label={`Move ${track.title} up`}
                    size={20}
                    color={colors.textMuted}
                    disabled={i === 0}
                    onPress={() => moveInQueue(index, index - 1)}
                  />
                  <IconButton
                    icon="chevron-down"
                    label={`Move ${track.title} down`}
                    size={20}
                    color={colors.textMuted}
                    disabled={i === upcoming.length - 1}
                    onPress={() => moveInQueue(index, index + 1)}
                  />
                  <IconButton
                    icon="close"
                    label={`Remove ${track.title} from queue`}
                    size={20}
                    color={colors.textMuted}
                    onPress={() => removeFromQueue(index)}
                  />
                </View>
              }
            />
          )}
          ListEmptyComponent={
            <Text style={[type.caption, styles.hint, { color: colors.textMuted }]}>
              Nothing up next. Use “Play next” or “Add to queue” from any song’s ⋮ menu.
            </Text>
          }
          contentContainerStyle={styles.list}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page - 10,
  },
  title: { flex: 1, textAlign: 'center' },
  clear: { width: 44, alignItems: 'flex-end', paddingRight: 10 },
  section: { paddingHorizontal: spacing.page, marginTop: spacing.lg, marginBottom: spacing.xs },
  controls: { flexDirection: 'row', marginRight: -10 },
  hint: { paddingHorizontal: spacing.page, paddingTop: spacing.sm },
  list: { paddingBottom: spacing.xxl },
});
