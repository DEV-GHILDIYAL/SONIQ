import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { buildMixes } from '@/lib/recommendations';
import { useRecsStore } from '@/store/recsStore';
import { DjCard } from './DjCard';
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

  return (
    <>
      <SectionHeader
        title="Made for you"
        actionLabel={mixes.length === 0 ? undefined : building ? 'Updating…' : 'Refresh'}
        onAction={building || mixes.length === 0 ? undefined : () => void buildMixes(true)}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <DjCard />
        {mixes.map((m) => (
          <MixCard key={m.id} mix={m} onPress={() => router.push(`/mix/${m.id}`)} />
        ))}
        {mixes.length === 0 && building ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[type.caption, styles.emptyText, { color: colors.textMuted }]}>
              Picking songs from what you listen to…
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.md, paddingHorizontal: spacing.page },
  empty: {
    width: 148,
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyText: { textAlign: 'center' },
});
