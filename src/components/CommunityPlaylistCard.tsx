import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PublicPlaylistCard } from '@/lib/publicPlaylists';
import { colorFor, radius, spacing, type, useTheme } from './theme';

/** Cover for a community playlist: 2×2 collage of its first covers, or one cover / colour. */
export function UrlCover({
  seed,
  urls,
  size,
}: {
  seed: string;
  urls: readonly string[];
  size: number;
}) {
  const shape = { width: size, height: size, borderRadius: size >= 120 ? radius.md : radius.sm };
  if (urls.length >= 4) {
    const half = size / 2;
    return (
      <View style={[shape, styles.grid, { backgroundColor: colorFor(seed) }]}>
        {urls.slice(0, 4).map((u) => (
          <Image
            key={u}
            source={{ uri: u }}
            style={{ width: half, height: half }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ))}
      </View>
    );
  }
  if (urls[0]) {
    return (
      <Image
        source={{ uri: urls[0] }}
        style={[shape, { backgroundColor: colorFor(seed) }]}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }
  return (
    <View style={[shape, styles.fallback, { backgroundColor: colorFor(seed) }]}>
      <Ionicons name="musical-notes" size={Math.round(size * 0.4)} color="rgba(255,255,255,0.9)" />
    </View>
  );
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

type Props = { card: PublicPlaylistCard; onPress: () => void; layout?: 'tile' | 'row' };

/** Community playlist: a tile for horizontal rows, or a list row. */
export function CommunityPlaylistCard({ card, onPress, layout = 'tile' }: Props) {
  const { colors } = useTheme();
  const meta = `by ${card.owner_name} · ${card.track_count} songs`;
  if (layout === 'row') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${card.name}, ${meta}`}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
      >
        <UrlCover seed={card.id} urls={card.covers} size={56} />
        <View style={styles.flex}>
          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {card.name}
          </Text>
          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {card.plays > 0 ? (
          <View style={styles.plays}>
            <Ionicons name="play" size={11} color={colors.textMuted} />
            <Text style={[type.caption, { color: colors.textMuted }]}>
              {formatCount(card.plays)}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${card.name}, ${meta}`}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.85 : 1 }]}
    >
      <UrlCover seed={card.id} urls={card.covers} size={140} />
      <Text style={[type.bodyStrong, styles.tileName, { color: colors.text }]} numberOfLines={1}>
        {card.name}
      </Text>
      <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
        by {card.owner_name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  tile: { width: 140 },
  tileName: { marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.sm,
  },
  plays: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
