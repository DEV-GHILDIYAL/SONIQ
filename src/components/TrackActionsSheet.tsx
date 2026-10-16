import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addToQueue, playNext } from '@/player/engine';
import { albumKey, artistKey } from '@/sources/registry';
import { usePlaylistStore } from '@/store/playlistStore';
import { Artwork } from './Artwork';
import { radius, spacing, type, useTheme } from './theme';
import { useTrackActionsStore } from './trackActionsStore';

type IconName = keyof typeof Ionicons.glyphMap;
type View_ = 'menu' | 'playlists' | 'new';

function ActionRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceHigh }]}
    >
      <Ionicons name={icon} size={22} color={danger ? colors.danger : colors.textMuted} />
      <Text style={[type.body, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

/** Bottom sheet with actions for one track. Mounted once in the root layout. */
export function TrackActionsSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const track = useTrackActionsStore((s) => s.track);
  const playlistId = useTrackActionsStore((s) => s.playlistId);
  const close = useTrackActionsStore((s) => s.close);
  const playlists = usePlaylistStore((s) => s.playlists);
  const [view, setView] = useState<View_>('menu');
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const dismiss = () => {
    close();
    setView('menu');
    setName('');
    setNotice(null);
  };

  if (!track) return null;

  const album = albumKey(track);
  const artist = artistKey(track);
  const go = (path: Parameters<typeof router.push>[0]) => {
    dismiss();
    router.push(path);
  };
  const addTo = (id: string, label: string) => {
    const added = usePlaylistStore.getState().addTracks(id, [track]);
    setNotice(added ? `Added to ${label}` : `Already in ${label}`);
    setView('menu');
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.surfacePressed }]} />
        <View style={styles.header}>
          <Artwork seed={track.id} uri={track.artworkUrl} size={48} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.text }]}>
              {track.title}
            </Text>
            <Text numberOfLines={1} style={[type.caption, { color: colors.textMuted }]}>
              {track.artist}
            </Text>
          </View>
        </View>
        {notice ? (
          <Text style={[type.caption, styles.notice, { color: colors.accent }]}>{notice}</Text>
        ) : null}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {view === 'menu' ? (
          <>
            <ActionRow
              icon="play-forward-outline"
              label="Play next"
              onPress={() => {
                void playNext([track]);
                dismiss();
              }}
            />
            <ActionRow
              icon="list-outline"
              label="Add to queue"
              onPress={() => {
                void addToQueue([track]);
                dismiss();
              }}
            />
            <ActionRow
              icon="add-circle-outline"
              label="Add to playlist"
              onPress={() => setView('playlists')}
            />
            {album ? (
              <ActionRow
                icon="disc-outline"
                label="Go to album"
                onPress={() =>
                  go({ pathname: '/album/[id]', params: { id: album, title: track.album ?? '' } })
                }
              />
            ) : null}
            {artist ? (
              <ActionRow
                icon="person-outline"
                label="Go to artist"
                onPress={() =>
                  go({ pathname: '/artist/[id]', params: { id: artist, name: track.artist } })
                }
              />
            ) : null}
            {playlistId ? (
              <ActionRow
                icon="remove-circle-outline"
                label="Remove from this playlist"
                danger
                onPress={() => {
                  usePlaylistStore.getState().removeTrack(playlistId, track.id);
                  dismiss();
                }}
              />
            ) : null}
          </>
        ) : null}

        {view === 'playlists' ? (
          <ScrollView style={styles.list}>
            <ActionRow icon="add" label="New playlist" onPress={() => setView('new')} />
            {playlists.map((p) => (
              <ActionRow
                key={p.id}
                icon="musical-notes-outline"
                label={p.name}
                onPress={() => addTo(p.id, p.name)}
              />
            ))}
          </ScrollView>
        ) : null}

        {view === 'new' ? (
          <View style={styles.newRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Playlist name"
              placeholderTextColor={colors.placeholder}
              autoFocus
              maxLength={60}
              style={[
                type.body,
                styles.input,
                { color: colors.text, backgroundColor: colors.surfaceHigh },
              ]}
              accessibilityLabel="Playlist name"
            />
            <Pressable
              disabled={!name.trim()}
              onPress={() => {
                const p = usePlaylistStore.getState().createPlaylist(name);
                setName('');
                addTo(p.id, p.name);
              }}
              accessibilityRole="button"
              style={[
                styles.create,
                { backgroundColor: colors.accent, opacity: name.trim() ? 1 : 0.4 },
              ]}
            >
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Create</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    maxHeight: '75%',
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.page,
  },
  notice: { paddingHorizontal: spacing.page, marginTop: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, marginTop: spacing.md },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 52,
    paddingHorizontal: spacing.page,
  },
  list: { maxHeight: 360 },
  newRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.page,
  },
  input: { flex: 1, height: 48, borderRadius: radius.md, paddingHorizontal: spacing.md },
  create: {
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    justifyContent: 'center',
  },
});
