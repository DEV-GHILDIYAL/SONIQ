import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { LIST_PERF } from '@/components/listPerf';
import { mixColors } from '@/components/MixCard';
import { Screen } from '@/components/Screen';
import { PAGE_BOTTOM_PADDING, spacing, type, useTheme, withAlpha } from '@/components/theme';
import { TrackRow } from '@/components/TrackRow';
import { openTrackActions } from '@/components/trackActionsStore';
import { tapHaptic } from '@/lib/haptics';
import { allowed } from '@/lib/taste';
import { playQueue, toggleShuffle } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { usePlayerStore } from '@/store/playerStore';
import { useRecsStore } from '@/store/recsStore';
import { useTasteStore } from '@/store/tasteStore';

const ABOUT: Record<string, string> = {
  repeat: 'Your most-loved songs lately: the ones you finish, replay and like.',
  daily: 'Songs you love plus a few new ones in the same vibe. Updated every day.',
  fresh: 'Artists you haven’t played yet, picked from your taste.',
  because: 'More songs with the same feel.',
};

/** A "Made for you" mix. Songs marked "not interested" disappear right away. */
export default function MixScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const mix = useRecsStore((s) => s.mixes.find((m) => m.id === id));
  // Re-filter when feedback changes (not interested / blocked artist).
  useTasteStore((s) => s.notInterested.length + s.blockedArtists.length);
  const activeId = usePlayerStore((s) => currentTrack(s.queue)?.id);

  const topBar = (
    <View style={styles.topBar}>
      <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
    </View>
  );

  if (!mix) {
    return (
      <Screen>
        {topBar}
        <EmptyState
          icon="sparkles-outline"
          title="This mix was refreshed"
          message="Open Home to see your new mixes."
        />
      </Screen>
    );
  }

  const tracks = mix.tracks.filter(allowed);
  const [c1] = mixColors(mix);
  const play = (i: number, shuffle = false) => {
    if (tracks.length === 0) return;
    tapHaptic();
    if (shuffle && !usePlayerStore.getState().shuffle) toggleShuffle();
    void playQueue(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : i);
  };

  const header = (
    <View>
      <LinearGradient colors={[withAlpha(c1, 0.55), 'transparent']} style={styles.hero}>
        <Text
          accessibilityRole="header"
          style={[type.display, { color: colors.text }]}
          numberOfLines={2}
        >
          {mix.title}
        </Text>
        <Text style={[type.body, { color: colors.textMuted }]}>{mix.subtitle}</Text>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          {ABOUT[mix.kind]} · {tracks.length} songs
        </Text>
        <View style={styles.actions}>
          <IconButton icon="shuffle" label="Shuffle" size={24} onPress={() => play(0, true)} />
          <IconButton
            icon="play"
            label={`Play ${mix.title}`}
            onPress={() => play(0)}
            color={colors.onAccent}
            size={26}
            style={[styles.play, { backgroundColor: colors.accent }]}
          />
        </View>
      </LinearGradient>
    </View>
  );

  return (
    <Screen>
      {topBar}
      <FlatList
        {...LIST_PERF}
        data={tracks}
        keyExtractor={(t) => t.id}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            active={item.id === activeId}
            onPress={() => play(index)}
            onMore={(t) => openTrackActions(t)}
          />
        )}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
      />
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
  hero: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  play: { width: 52, height: 52, borderRadius: 26 },
  list: { paddingBottom: PAGE_BOTTOM_PADDING },
});
