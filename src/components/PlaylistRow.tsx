import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Playlist } from '@/store/playlistStore';
import { PlaylistCover } from './PlaylistCover';
import { IconButton } from './IconButton';
import { spacing, type, useTheme } from './theme';

type Props = {
  playlist: Playlist;
  onPress: (playlist: Playlist) => void;
  onMore?: (playlist: Playlist) => void;
};

export function PlaylistRow({ playlist, onPress, onMore }: Props) {
  const { colors } = useTheme();
  const count = playlist.tracks.length;
  return (
    <Pressable
      onPress={() => onPress(playlist)}
      onLongPress={onMore ? () => onMore(playlist) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Playlist ${playlist.name}, ${count} songs`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
    >
      <PlaylistCover seed={playlist.id} tracks={playlist.tracks} size={56} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[type.body, { color: colors.text, fontWeight: '600' }]}>
          {playlist.name}
        </Text>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          Playlist · {count} {count === 1 ? 'song' : 'songs'}
        </Text>
      </View>
      {onMore ? (
        <IconButton
          icon="ellipsis-vertical"
          label={`More options for ${playlist.name}`}
          color={colors.textMuted}
          size={20}
          onPress={() => onMore(playlist)}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.page,
    paddingRight: spacing.page - 10,
    paddingVertical: spacing.sm,
    minHeight: 72,
  },
  text: { flex: 1, gap: 2 },
});
