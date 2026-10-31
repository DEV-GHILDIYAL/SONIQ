import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showSheet } from '@/components/Sheet';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { PlaylistRow } from '@/components/PlaylistRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextPrompt } from '@/components/TextPrompt';
import { TrackRow } from '@/components/TrackRow';
import { openTrackActions } from '@/components/trackActionsStore';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme } from '@/components/theme';
import { playQueue } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { importLocalFiles, localFileToTrack } from '@/sources/registry';
import { useLocalLibraryStore } from '@/store/localLibraryStore';
import { usePlayerStore } from '@/store/playerStore';
import { choosePhoneFolder, formatBytes } from '@/lib/downloads';
import { useDownloadStore } from '@/store/downloadStore';
import { useLikedStore } from '@/store/likedStore';
import { usePlaylistStore, type Playlist } from '@/store/playlistStore';

type Filter = 'all' | 'playlists' | 'downloaded' | 'device';

export default function LibraryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const playlists = usePlaylistStore((s) => s.playlists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const localFiles = useLocalLibraryStore((s) => s.files);
  const likedCount = useLikedStore((s) => s.tracks.length);
  const activeId = usePlayerStore((s) => currentTrack(s.queue)?.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const [importing, setImporting] = useState(false);

  const localTracks = useMemo(() => localFiles.map(localFileToTrack), [localFiles]);
  const downloadItems = useDownloadStore((s) => s.items);
  const downloadPending = useDownloadStore((s) => s.pending);
  const phoneFolder = useDownloadStore((s) => s.phoneFolder);
  const downloaded = useMemo(
    () => Object.values(downloadItems).sort((a, b) => b.at - a.at),
    [downloadItems],
  );
  const downloadedTracks = useMemo(() => downloaded.map((d) => d.track), [downloaded]);
  const downloadedBytes = useMemo(() => downloaded.reduce((n, d) => n + d.bytes, 0), [downloaded]);
  const showDevice = filter === 'all' || filter === 'device';
  const showPlaylists = filter === 'all' || filter === 'playlists';
  const showDownloads = filter === 'downloaded';

  const openMenu = (p: Playlist) =>
    showSheet(p.name, undefined, [
      { text: 'Rename', icon: 'create-outline', onPress: () => setRenaming(p) },
      {
        text: 'Delete playlist',
        icon: 'trash-outline',
        style: 'destructive',
        onPress: () =>
          showSheet(`Delete "${p.name}"?`, 'This playlist will be removed from your library.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => usePlaylistStore.getState().deletePlaylist(p.id),
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const onImport = async () => {
    setImporting(true);
    try {
      await importLocalFiles();
    } catch (err) {
      showSheet('Import failed', err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Library"
        right={
          <IconButton
            icon="add"
            label="Create playlist"
            size={28}
            onPress={() => setCreating(true)}
          />
        }
      />
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip
            label="Playlists"
            selected={filter === 'playlists'}
            onPress={() => setFilter('playlists')}
          />
          <Chip
            label="Downloaded"
            selected={filter === 'downloaded'}
            onPress={() => setFilter('downloaded')}
          />
          <Chip
            label="On this device"
            selected={filter === 'device'}
            onPress={() => setFilter('device')}
          />
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: CONTENT_BOTTOM_PADDING }}>
        {showDownloads ? (
          <>
            <Text style={[type.caption, styles.section, { color: colors.textMuted }]}>
              {downloaded.length} {downloaded.length === 1 ? 'song' : 'songs'} ·{' '}
              {formatBytes(downloadedBytes)}
              {downloadPending.length > 0 ? ` · ${downloadPending.length} downloading` : ''}
            </Text>
            <Pressable
              onPress={() => void choosePhoneFolder().catch(() => {})}
              accessibilityRole="button"
              style={styles.folderRow}
            >
              <Ionicons name="folder-outline" size={16} color={colors.textMuted} />
              <Text
                style={[type.caption, styles.flex, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                Save to phone folder: {phoneFolder ? phoneFolder.name : 'not chosen yet'}
              </Text>
              <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>
                {phoneFolder ? 'Change' : 'Choose'}
              </Text>
            </Pressable>
            {downloadPending.map((t) => (
              <TrackRow key={`p-${t.id}`} track={t} onMore={openTrackActions} />
            ))}
            {downloadedTracks.length > 0 ? (
              downloadedTracks.map((t, i) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  active={t.id === activeId}
                  onPress={() => void playQueue(downloadedTracks, i)}
                  onMore={openTrackActions}
                />
              ))
            ) : downloadPending.length === 0 ? (
              <EmptyState
                icon="arrow-down-circle-outline"
                title="No downloads yet"
                message="Long-press any song and choose “Download” to play it without internet."
              />
            ) : null}
          </>
        ) : null}
        {showPlaylists ? (
          <Pressable
            onPress={() => router.push('/ai-playlist')}
            accessibilityRole="button"
            accessibilityLabel="Create a playlist with AI"
            style={({ pressed }) => [
              styles.aiCard,
              { backgroundColor: colors.accentSoft, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <View style={[styles.aiIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="sparkles" size={20} color={colors.onAccent} />
            </View>
            <View style={styles.flex}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>Create with AI</Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                Describe a vibe, get a playlist
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {showPlaylists ? (
          <Pressable
            onPress={() => router.push('/liked')}
            accessibilityRole="button"
            accessibilityLabel={`Liked Songs, ${likedCount} songs`}
            style={({ pressed }) => [
              styles.importRow,
              pressed && { backgroundColor: colors.surface },
            ]}
          >
            <View style={[styles.importIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="heart" size={26} color={colors.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={[type.body, { color: colors.text, fontWeight: '600' }]}>
                Liked Songs
              </Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                {likedCount} {likedCount === 1 ? 'song' : 'songs'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
          </Pressable>
        ) : null}
        {showDevice ? (
          <>
            <Pressable
              onPress={onImport}
              disabled={importing}
              accessibilityRole="button"
              accessibilityLabel="Import music from this device"
              style={({ pressed }) => [
                styles.importRow,
                pressed && { backgroundColor: colors.surface },
              ]}
            >
              <View style={[styles.importIcon, { backgroundColor: colors.accentSoft }]}>
                {importing ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Ionicons name="folder-open-outline" size={26} color={colors.accent} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={[type.body, { color: colors.text, fontWeight: '600' }]}>
                  Import local files
                </Text>
                <Text style={[type.caption, { color: colors.textMuted }]}>
                  {localFiles.length > 0
                    ? `${localFiles.length} ${localFiles.length === 1 ? 'song' : 'songs'} on this device`
                    : 'Pick MP3, M4A, FLAC… from your phone'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
            </Pressable>
            {localTracks.length > 0 ? (
              <>
                <Text style={[type.heading, styles.section, { color: colors.text }]}>
                  On this device
                </Text>
                {localTracks.map((t, i) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    active={t.id === activeId}
                    onPress={() => void playQueue(localTracks, i)}
                    onMore={openTrackActions}
                  />
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {showPlaylists ? (
          <>
            <Text style={[type.heading, styles.section, { color: colors.text }]}>Playlists</Text>
            {playlists.length > 0 ? (
              playlists.map((p) => (
                <PlaylistRow
                  key={p.id}
                  playlist={p}
                  onPress={(pl) => router.push(`/playlist/${pl.id}`)}
                  onMore={openMenu}
                />
              ))
            ) : (
              <EmptyState
                icon="albums-outline"
                title="Create your first playlist"
                message="It's easy, we'll help you."
                actionLabel="Create playlist"
                onAction={() => setCreating(true)}
              />
            )}
          </>
        ) : null}
      </ScrollView>

      <TextPrompt
        visible={creating}
        title="Give your playlist a name"
        initialValue="My playlist"
        confirmLabel="Create"
        onCancel={() => setCreating(false)}
        onConfirm={(name) => {
          const p = createPlaylist(name);
          setCreating(false);
          router.push(`/playlist/${p.id}`);
        }}
      />
      <TextPrompt
        visible={renaming !== null}
        title="Rename playlist"
        initialValue={renaming?.name ?? ''}
        confirmLabel="Save"
        onCancel={() => setRenaming(null)}
        onConfirm={(name) => {
          if (renaming) usePlaylistStore.getState().renamePlaylist(renaming.id, name);
          setRenaming(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.page,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  aiIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.page, paddingBottom: spacing.sm },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.sm,
  },
  section: { paddingHorizontal: spacing.page, marginTop: spacing.xl, marginBottom: spacing.sm },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 72,
  },
  importIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
