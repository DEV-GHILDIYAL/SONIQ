import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { formatCount, UrlCover } from '@/components/CommunityPlaylistCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { LIST_PERF } from '@/components/listPerf';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { TrackListSkeleton } from '@/components/Skeleton';
import { spacing, type, useTheme } from '@/components/theme';
import { TrackRow } from '@/components/TrackRow';
import { openTrackActions } from '@/components/trackActionsStore';
import { successHaptic, tapHaptic } from '@/lib/haptics';
import {
  getPublicPlaylist,
  isMine,
  playlistLink,
  recordPublicPlay,
  reportPublicPlaylist,
  savePublicPlaylist,
  type PublicPlaylist,
} from '@/lib/publicPlaylists';
import { playQueue, toggleShuffle } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { usePlayerStore } from '@/store/playerStore';
import { usePlaylistStore } from '@/store/playlistStore';

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'done'; playlist: PublicPlaylist };

const REASONS = ['Spam or misleading', 'Offensive name', 'Something else'];

/** Someone's public playlist: listen, shuffle, save a copy, share. Read-only. */
export default function CommunityPlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const activeId = usePlayerStore((s) => currentTrack(s.queue)?.id);
  const saved = usePlaylistStore((s) => s.playlists.some((p) => p.copiedFrom?.id === id));

  useEffect(() => {
    let cancelled = false;
    getPublicPlaylist(id)
      .then((playlist) => !cancelled && setLoad({ status: 'done', playlist }))
      .catch((error: unknown) => !cancelled && setLoad({ status: 'error', error }));
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const topBar = (extra?: React.ReactNode) => (
    <View style={styles.topBar}>
      <IconButton
        icon="chevron-back"
        label="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      <View style={styles.flex} />
      {extra}
    </View>
  );

  if (load.status !== 'done') {
    return (
      <Screen>
        {topBar()}
        {load.status === 'loading' ? (
          <TrackListSkeleton />
        ) : (
          <ErrorState error={load.error} onRetry={retry} />
        )}
      </Screen>
    );
  }

  const p = load.playlist;
  const mine = isMine(p);

  const play = (index: number, shuffle = false) => {
    if (p.tracks.length === 0) return;
    tapHaptic();
    if (!mine) recordPublicPlay(p.id);
    if (shuffle && !usePlayerStore.getState().shuffle) toggleShuffle();
    void playQueue(p.tracks, shuffle ? Math.floor(Math.random() * p.tracks.length) : index);
  };

  const save = () => {
    const copy = savePublicPlaylist(p);
    successHaptic();
    showSheet(
      'Saved to your library',
      `“${copy.name}” is now in your playlists. You can edit your copy.`,
      [
        {
          text: 'Open it',
          icon: 'albums-outline',
          onPress: () => router.push(`/playlist/${copy.id}`),
        },
        { text: 'OK', style: 'cancel' },
      ],
    );
  };

  const share = () =>
    void Share.share({
      message: `🎧 “${p.name}” by ${p.owner_name} on SONIQ\n${playlistLink(p.id)}`,
    }).catch(() => {});

  const report = () =>
    showSheet(
      'Report this playlist?',
      'Tell us what is wrong. The owner is not told who reported it.',
      [
        ...REASONS.map((r) => ({
          text: r,
          onPress: () =>
            void reportPublicPlaylist(p.id, r)
              .then(() => showSheet('Thanks', 'We will take a look.'))
              .catch((err: unknown) =>
                showSheet("Couldn't report", err instanceof Error ? err.message : String(err)),
              ),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );

  const more = () =>
    showSheet(p.name, undefined, [
      { text: 'Share link', icon: 'share-social-outline', onPress: share },
      ...(mine ? [] : [{ text: 'Report', icon: 'flag-outline' as const, onPress: report }]),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const header = (
    <View style={styles.hero}>
      <UrlCover seed={p.id} urls={p.covers} size={180} />
      <Text
        accessibilityRole="header"
        style={[type.title, styles.center, { color: colors.text }]}
        numberOfLines={2}
      >
        {p.name}
      </Text>
      <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
        by{' '}
        <Text style={{ color: colors.text, fontWeight: '700' }}>{mine ? 'you' : p.owner_name}</Text>{' '}
        · {p.track_count} songs{p.plays > 0 ? ` · ${formatCount(p.plays)} plays` : ''}
        {p.saves > 0 ? ` · ${formatCount(p.saves)} saves` : ''}
      </Text>
      <View style={styles.actions}>
        {mine ? null : (
          <Pressable
            onPress={saved ? undefined : save}
            disabled={saved}
            accessibilityRole="button"
            style={[styles.secondary, { borderColor: saved ? colors.border : colors.text }]}
          >
            <Ionicons name={saved ? 'checkmark' : 'add'} size={18} color={colors.text} />
            <Text style={[type.bodyStrong, { color: colors.text }]}>
              {saved ? 'Saved' : 'Save'}
            </Text>
          </Pressable>
        )}
        <IconButton icon="shuffle" label="Shuffle" size={24} onPress={() => play(0, true)} />
        <IconButton
          icon="play"
          label={`Play ${p.name}`}
          disabled={p.tracks.length === 0}
          onPress={() => play(0)}
          color={colors.onAccent}
          size={26}
          style={[styles.play, { backgroundColor: colors.accent }]}
        />
      </View>
    </View>
  );

  return (
    <Screen>
      {topBar(<IconButton icon="ellipsis-horizontal" label="More" onPress={more} />)}
      <FlatList
        {...LIST_PERF}
        data={p.tracks}
        keyExtractor={(t, i) => `${t.id}:${i}`}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            active={item.id === activeId}
            onPress={() => play(index)}
            onMore={(t) => openTrackActions(t)}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState icon="musical-notes-outline" title="No songs yet" />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page - 10,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.md,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  play: { width: 52, height: 52, borderRadius: 26 },
  list: { paddingBottom: spacing.xxl },
});
