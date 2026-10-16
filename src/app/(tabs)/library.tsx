import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { usePlaylistStore } from '@/store/playlistStore';

type Filter = 'all' | 'playlists' | 'device';

export default function LibraryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const playlists = usePlaylistStore((s) => s.playlists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const localFiles = useLocalLibraryStore((s) => s.files);
  const activeId = usePlayerStore((s) => currentTrack(s.queue)?.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const localTracks = useMemo(() => localFiles.map(localFileToTrack), [localFiles]);
  const showDevice = filter !== 'playlists';
  const showPlaylists = filter !== 'device';

  const onImport = async () => {
    setImporting(true);
    try {
      await importLocalFiles();
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : String(err));
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
            label="On this device"
            selected={filter === 'device'}
            onPress={() => setFilter('device')}
          />
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: CONTENT_BOTTOM_PADDING }}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.page, paddingBottom: spacing.sm },
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
