import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { buildMixes } from '@/lib/recommendations';
import { useRecsStore } from '@/store/recsStore';
import { MixCard } from './MixCard';
import { SectionHeader } from './SectionHeader';
import { spacing, type, useTheme } from './theme';

/** Home: "Made for you" mixes. Refreshes in the background when they are old. */
export function MadeForYou() {
  const { colors } = useTheme();
  const router = useRouter();
  const mixes = useRecsStore((s) => s.mixes);
  const building = useRecsStore((s) => s.building);

  useFocusEffect(
    useCallback(() => {
      void buildMixes();
    }, []),
  );

  if (mixes.length === 0) {
    if (!building) return null;
    return (
      <>
        <SectionHeader title="Made for you" />
        <View style={styles.empty}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[type.caption, { color: colors.textMuted }]}>
            Picking songs from what you listen to…
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        title="Made for you"
        actionLabel={building ? 'Updating…' : 'Refresh'}
        onAction={building ? undefined : () => void buildMixes(true)}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {mixes.map((m) => (
          <MixCard key={m.id} mix={m} onPress={() => router.push(`/mix/${m.id}`)} />
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.md, paddingHorizontal: spacing.page },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.md,
  },
});
