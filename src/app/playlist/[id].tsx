import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { PlaylistCover } from '@/components/PlaylistCover';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { TrackRow } from '@/components/TrackRow';
import { spacing, type, useTheme } from '@/components/theme';
import { openTrackActions } from '@/components/trackActionsStore';
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
          </Text>
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
  play: { width: 52, height: 52, borderRadius: 26 },
  list: { paddingBottom: spacing.xxl },
});
