import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { showSheet } from '@/components/Sheet';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { TrackRow } from '@/components/TrackRow';
import { openTrackActions } from '@/components/trackActionsStore';
import { radius, spacing, type, useTheme } from '@/components/theme';
import { downloadTracks } from '@/lib/downloads';
import { playQueue } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { useLikedStore } from '@/store/likedStore';
import { usePlayerStore } from '@/store/playerStore';
import { LIST_PERF } from '@/components/listPerf';

export default function LikedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const tracks = useLikedStore((s) => s.tracks);
  const activeId = usePlayerStore((s) => currentTrack(s.queue)?.id);
  const count = tracks.length;

  const playShuffled = () => {
    const mixed = [...tracks];
    for (let i = mixed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mixed[i], mixed[j]] = [
        mixed[j] as (typeof mixed)[number],
        mixed[i] as (typeof mixed)[number],
      ];
    }
    void playQueue(mixed, 0);
  };

  const header = (
    <View style={styles.hero}>
      <View style={[styles.cover, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="heart" size={72} color={colors.accent} />
      </View>
      <View style={styles.metaRow}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={[type.title, { color: colors.text }]}>
            Liked Songs
          </Text>
          <Text style={[type.caption, styles.count, { color: colors.textMuted }]}>
            {count} {count === 1 ? 'song' : 'songs'}
          </Text>
        </View>
        <IconButton
          icon="arrow-down-circle-outline"
          label="Download all liked songs"
          disabled={count === 0}
          onPress={() => {
            const n = downloadTracks(tracks);
            showSheet(
              n > 0 ? `Downloading ${n} ${n === 1 ? 'song' : 'songs'}` : 'Already downloaded',
              n > 0 ? 'Progress is in Library → Downloaded.' : undefined,
            );
          }}
          size={24}
          color={colors.accent}
        />
        <IconButton
          icon="shuffle"
          label="Shuffle liked songs"
          disabled={count === 0}
          onPress={playShuffled}
          size={24}
          color={colors.accent}
        />
        <IconButton
          icon="play"
          label="Play liked songs"
          disabled={count === 0}
          onPress={() => void playQueue(tracks, 0)}
          color={colors.onAccent}
          size={26}
          style={[styles.play, { backgroundColor: colors.accent }]}
        />
      </View>
    </View>
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
      </View>
      <FlatList
        {...LIST_PERF}
        data={tracks}
        keyExtractor={(t) => t.id}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            active={item.id === activeId}
            onPress={() => void playQueue(tracks, index)}
            onMore={(t) => openTrackActions(t)}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title="No liked songs yet"
            message="Tap ♥ on the player, or long-press any song and choose “Like”."
          />
        }
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page - 10,
  },
  hero: { paddingHorizontal: spacing.page, paddingBottom: spacing.md },
  cover: {
    alignSelf: 'center',
    width: 180,
    height: 180,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  count: { marginTop: 4 },
  play: { width: 52, height: 52, borderRadius: 26 },
  list: { paddingBottom: spacing.xxl },
});
