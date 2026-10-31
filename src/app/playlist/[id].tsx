import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PlaylistCover } from '@/components/PlaylistCover';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { TrackRow } from '@/components/TrackRow';
import {
  PAGE_BOTTOM_PADDING,
  radius,
  spacing,
  type,
  useTheme,
  withAlpha,
} from '@/components/theme';
import { openTrackActions } from '@/components/trackActionsStore';
import { successHaptic } from '@/lib/haptics';
import {
  playlistLink,
  publicPlaylistsAvailable,
  publishPlaylist,
  unpublishPlaylist,
} from '@/lib/publicPlaylists';
import { playQueue } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { usePlayerStore } from '@/store/playerStore';
import { usePlaylistStore } from '@/store/playlistStore';
import { LIST_PERF } from '@/components/listPerf';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const playlist = usePlaylistStore((s) => s.playlists.find((p) => p.id === id));
  const { moveTrack, removeTrack } = usePlaylistStore.getState();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const activeId = usePlayerStore((s) => currentTrack(s.queue)?.id);

  const canEdit = (playlist?.tracks.length ?? 0) > 0;
  const topBar = (
    <View style={styles.topBar}>
      <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
      <View style={styles.flex} />
      {canEdit ? (
        <Pressable
          onPress={() => setEditing((e) => !e)}
          accessibilityRole="button"
          hitSlop={10}
          style={styles.edit}
        >
          <Text style={[type.bodyStrong, { color: colors.accent }]}>
            {editing ? 'Done' : 'Edit'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (!playlist) {
    return (
      <Screen>
        {topBar}
        <EmptyState icon="alert-circle-outline" title="Playlist not found" />
      </Screen>
    );
  }

  const count = playlist.tracks.length;
  const isPublic = !!playlist.publicId;
  const localOnly = playlist.tracks.filter((t) => t.source === 'local').length;

  const share = (publicId: string) =>
    void Share.share({
      message: `🎧 “${playlist.name}” on SONIQ\n${playlistLink(publicId)}`,
    }).catch(() => {});

  const run = (job: () => Promise<unknown>, done?: () => void) => {
    setBusy(true);
    job()
      .then(() => done?.())
      .catch((err: unknown) =>
        showSheet("Couldn't update", err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setBusy(false));
  };

  const makePublic = () =>
    showSheet(
      'Make this playlist public?',
      `Anyone on SONIQ can find and play it, with your name on it. Only you can change it.${
        localOnly
          ? `\n\n${localOnly} song${localOnly === 1 ? '' : 's'} from your phone stay private.`
          : ''
      }`,
      [
        {
          text: 'Make public',
          icon: 'globe-outline',
          onPress: () =>
            run(
              () => publishPlaylist(playlist.id),
              () => {
                successHaptic();
                const pid = usePlaylistStore
                  .getState()
                  .playlists.find((x) => x.id === playlist.id)?.publicId;
                showSheet('It’s public 🎉', 'People can now find it in Community playlists.', [
                  ...(pid
                    ? [
                        {
                          text: 'Share link',
                          icon: 'share-social-outline' as const,
                          onPress: () => share(pid),
                        },
                      ]
                    : []),
                  { text: 'OK', style: 'cancel' as const },
                ]);
              },
            ),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );

  const visibilityMenu = () =>
    showSheet('Public playlist', 'Anyone can play it. Your edits update it automatically.', [
      ...(playlist.publicId
        ? [
            {
              text: 'Share link',
              icon: 'share-social-outline' as const,
              onPress: () => share(playlist.publicId as string),
            },
          ]
        : []),
      {
        text: 'Make private',
        icon: 'lock-closed-outline',
        style: 'destructive',
        onPress: () => run(() => unpublishPlaylist(playlist.id)),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const header = (
    <View style={styles.hero}>
      <PlaylistCover seed={playlist.id} tracks={playlist.tracks} size={180} style={styles.cover} />
      <View style={styles.metaRow}>
        <View style={styles.flex}>
          <Text
            accessibilityRole="header"
            style={[type.title, { color: colors.text }]}
            numberOfLines={2}
          >
            {playlist.name}
          </Text>
          <Text style={[type.caption, styles.count, { color: colors.textMuted }]}>
            Playlist · {count} {count === 1 ? 'song' : 'songs'}
            {playlist.copiedFrom ? ` · from ${playlist.copiedFrom.owner}` : ''}
          </Text>
          {publicPlaylistsAvailable() ? (
            <Pressable
              onPress={busy ? undefined : isPublic ? visibilityMenu : makePublic}
              accessibilityRole="button"
              accessibilityLabel={
                isPublic ? 'Public playlist. Change visibility' : 'Private playlist. Make public'
              }
              style={[
                styles.visibility,
                { backgroundColor: isPublic ? withAlpha(colors.accent, 0.15) : colors.surfaceHigh },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons
                  name={isPublic ? 'globe-outline' : 'lock-closed'}
                  size={13}
                  color={isPublic ? colors.accent : colors.textMuted}
                />
              )}
              <Text
                style={[
                  styles.visibilityText,
                  { color: isPublic ? colors.accent : colors.textMuted },
                ]}
              >
                {isPublic ? 'Public' : 'Private'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <IconButton
          icon="play"
          label={`Play ${playlist.name}`}
          disabled={count === 0}
          onPress={() => void playQueue(playlist.tracks, 0)}
          color={colors.onAccent}
          size={26}
          style={[styles.play, { backgroundColor: colors.accent }]}
        />
      </View>
    </View>
  );

  return (
    <Screen>
      {topBar}
      <FlatList
        {...LIST_PERF}
        data={playlist.tracks}
        keyExtractor={(t) => t.id}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            active={item.id === activeId}
            onPress={editing ? undefined : () => void playQueue(playlist.tracks, index)}
            onMore={(t) => openTrackActions(t, { playlistId: playlist.id })}
            right={
              editing ? (
                <View style={styles.editControls}>
                  <IconButton
                    icon="chevron-up"
                    label={`Move ${item.title} up`}
                    size={20}
                    color={colors.textMuted}
                    disabled={index === 0}
                    onPress={() => moveTrack(playlist.id, index, index - 1)}
                  />
                  <IconButton
                    icon="chevron-down"
                    label={`Move ${item.title} down`}
                    size={20}
                    color={colors.textMuted}
                    disabled={index === playlist.tracks.length - 1}
                    onPress={() => moveTrack(playlist.id, index, index + 1)}
                  />
                  <IconButton
                    icon="remove-circle-outline"
                    label={`Remove ${item.title}`}
                    size={20}
                    color={colors.danger}
                    onPress={() => removeTrack(playlist.id, item.id)}
                  />
                </View>
              ) : undefined
            }
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon="musical-notes-outline"
            title="This playlist is empty"
            message="Long-press any song (or tap ⋮) and choose “Add to playlist”."
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
  edit: { paddingRight: 10, minHeight: 44, justifyContent: 'center' },
  editControls: { flexDirection: 'row', marginRight: -10 },
  hero: { paddingHorizontal: spacing.page, paddingBottom: spacing.md },
  cover: { alignSelf: 'center', marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  count: { marginTop: 4 },
  visibility: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.pill,
  },
  visibilityText: { fontSize: 12, fontWeight: '800' },
  play: { width: 52, height: 52, borderRadius: 26 },
  list: { paddingBottom: PAGE_BOTTOM_PADDING },
});
