import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { playQueue } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import type { TrackCollection } from '@/sources/types';
import { usePlayerStore } from '@/store/playerStore';
import { Artwork } from './Artwork';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { TrackListSkeleton } from './Skeleton';
import { IconButton } from './IconButton';
import { Screen } from './Screen';
import { TrackRow } from './TrackRow';
import { PAGE_BOTTOM_PADDING, spacing, type, useTheme } from './theme';
import { openTrackActions } from './trackActionsStore';
import { LIST_PERF } from './listPerf';

type Props = {
  /** Stable key for the request (re-loads when it changes). */
  loadKey: string;
  load: () => Promise<TrackCollection>;
  /** Shown while loading. */
  fallbackTitle: string;
  rounded?: boolean;
  kind: 'Album' | 'Artist';
};

type LoadState =
  | { key: string; status: 'done'; data: TrackCollection }
  | { key: string; status: 'error'; message: string };

/** Shared layout for Album and Artist pages: cover, title, play-all, track list. */
export function CollectionScreen({ loadKey, load, fallbackTitle, rounded = false, kind }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const activeId = usePlayerStore((s) => currentTrack(s.queue)?.id);
  const [result, setResult] = useState<LoadState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${loadKey}#${attempt}`;

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setResult({ key: requestKey, status: 'done', data }))
      .catch(
        (err: unknown) =>
          !cancelled &&
          setResult({
            key: requestKey,
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          }),
      );
    return () => {
      cancelled = true;
    };
    // `load` is recreated every render; `requestKey` captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const current = result?.key === requestKey ? result : null;
  const data = current?.status === 'done' ? current.data : null;
  const tracks = data?.tracks ?? [];

  const header = (
    <View style={styles.hero}>
      <Artwork
        seed={loadKey}
        uri={data?.artworkUrl}
        size={180}
        rounded={rounded}
        icon={kind === 'Artist' ? 'person' : 'disc'}
        style={styles.cover}
      />
      <View style={styles.metaRow}>
        <View style={styles.flex}>
          <Text style={[type.micro, { color: colors.textMuted }]}>{kind.toUpperCase()}</Text>
          <Text
            accessibilityRole="header"
            style={[type.title, { color: colors.text }]}
            numberOfLines={2}
          >
            {data?.title ?? fallbackTitle}
          </Text>
          {data ? (
            <Text style={[type.caption, styles.count, { color: colors.textMuted }]}>
              {[data.subtitle !== 'Artist' ? data.subtitle : undefined, `${tracks.length} songs`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon="play"
          label={`Play ${data?.title ?? fallbackTitle}`}
          disabled={tracks.length === 0}
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
            onMore={openTrackActions}
            hideArtwork={kind === 'Album'}
            leading={kind === 'Album' ? index + 1 : undefined}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !current ? (
            <TrackListSkeleton />
          ) : current.status === 'error' ? (
            <ErrorState error={current.message} onRetry={() => setAttempt((n) => n + 1)} />
          ) : (
            <EmptyState icon="musical-notes-outline" title="No playable songs here" />
          )
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
  cover: { alignSelf: 'center', marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  count: { marginTop: 4 },
  play: { width: 52, height: 52, borderRadius: 26 },
  list: { paddingBottom: PAGE_BOTTOM_PADDING },
});
