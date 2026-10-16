import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton } from '@/components/IconButton';
import { PlaylistRow } from '@/components/PlaylistRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextPrompt } from '@/components/TextPrompt';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme } from '@/components/theme';
import { usePlaylistStore, type Playlist } from '@/store/playlistStore';

type Prompt = { mode: 'create' } | { mode: 'rename'; playlist: Playlist } | null;

export default function PlaylistsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const playlists = usePlaylistStore((s) => s.playlists);
  const { createPlaylist, renamePlaylist, deletePlaylist } = usePlaylistStore.getState();
  const [prompt, setPrompt] = useState<Prompt>(null);

  const confirmDelete = (p: Playlist) =>
    Alert.alert(`Delete "${p.name}"?`, 'This playlist will be removed from your library.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePlaylist(p.id) },
    ]);

  const openMenu = (p: Playlist) =>
    Alert.alert(p.name, undefined, [
      { text: 'Rename', onPress: () => setPrompt({ mode: 'rename', playlist: p }) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(p) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const createRow = (
    <Pressable
      onPress={() => setPrompt({ mode: 'create' })}
      accessibilityRole="button"
      style={({ pressed }) => [styles.createRow, pressed && { backgroundColor: colors.surface }]}
    >
      <View style={[styles.createIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="add" size={32} color={colors.accent} />
      </View>
      <Text style={[type.body, { color: colors.text, fontWeight: '600' }]}>Create playlist</Text>
    </Pressable>
  );

  return (
    <Screen>
      <ScreenHeader
        title="Playlists"
        right={
          <IconButton
            icon="add"
            label="Create playlist"
            size={28}
            onPress={() => setPrompt({ mode: 'create' })}
          />
        }
      />
      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PlaylistRow
            playlist={item}
            onPress={(p) => router.push(`/playlist/${p.id}`)}
            onMore={openMenu}
          />
        )}
        ListHeaderComponent={createRow}
        ListEmptyComponent={
          <Text style={[type.caption, styles.hint, { color: colors.textMuted }]}>
            No playlists yet. Tap “Create playlist” to start one.
          </Text>
        }
        contentContainerStyle={{ paddingBottom: CONTENT_BOTTOM_PADDING }}
      />

      <TextPrompt
        visible={prompt !== null}
        title={prompt?.mode === 'rename' ? 'Rename playlist' : 'Give your playlist a name'}
        initialValue={prompt?.mode === 'rename' ? prompt.playlist.name : 'My playlist'}
        confirmLabel={prompt?.mode === 'rename' ? 'Save' : 'Create'}
        onCancel={() => setPrompt(null)}
        onConfirm={(name) => {
          if (prompt?.mode === 'rename') renamePlaylist(prompt.playlist.id, name);
          else createPlaylist(name);
          setPrompt(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.sm,
    minHeight: 72,
  },
  createIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { paddingHorizontal: spacing.page, paddingTop: spacing.lg },
});
