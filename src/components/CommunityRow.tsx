import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  discoverPlaylists,
  publicPlaylistsAvailable,
  type PublicPlaylistCard,
} from '@/lib/publicPlaylists';
import { CommunityPlaylistCard } from './CommunityPlaylistCard';
import { spacing, type, useTheme } from './theme';

/** "Community playlists" strip (trending). Hidden when there is nothing to show. */
export function CommunityRow() {
  const { colors } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<PublicPlaylistCard[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!publicPlaylistsAvailable()) return;
      let cancelled = false;
      discoverPlaylists('trending', '', 12)
        .then((list) => !cancelled && setItems(list))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (items.length === 0) return null;

  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={[type.heading, styles.flex, { color: colors.text }]}>Community playlists</Text>
        <Pressable onPress={() => router.push('/community')} accessibilityRole="button" hitSlop={8}>
          <Text style={[type.bodyStrong, { color: colors.accent }]}>See all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {items.map((c) => (
          <CommunityPlaylistCard
            key={c.id}
            card={c}
            onPress={() => router.push(`/community/${c.id}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  strip: { gap: spacing.md, paddingRight: spacing.page },
});
