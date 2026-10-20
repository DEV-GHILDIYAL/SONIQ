import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GenreTile } from '@/components/GenreTile';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { Screen } from '@/components/Screen';
import { CONTENT_BOTTOM_PADDING, radius, spacing, tileColors, type, useTheme } from '@/components/theme';
import { GENRES } from '@/lib/genres';
import { useProfileStore } from '@/store/profileStore';

/** Search tab: a tap-to-search field (opens /find) and genres to browse. */
export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ProfileAvatar />
          <Text accessibilityRole="header" style={[type.display, { color: colors.text }]}>
            Search
          </Text>
        </View>

        <Pressable
          onPress={() => router.push('/search/find')}
          accessibilityRole="search"
          accessibilityLabel="What do you want to listen to?"
          style={({ pressed }) => [styles.field, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="search" size={22} color="#222" />
          <Text style={[type.body, styles.fieldText]} numberOfLines={1}>
            What do you want to listen to?
          </Text>
        </Pressable>

        <Text style={[type.heading, styles.sectionTitle, { color: colors.text }]}>Browse all</Text>
        <View style={styles.grid}>
          {GENRES.map((g, i) => (
            <View key={g.label} style={styles.cell}>
              <GenreTile
                label={g.label}
                icon={g.icon}
                color={tileColors[i % tileColors.length] ?? tileColors[0]}
                onPress={() => {
                  useProfileStore.getState().recordGenre(g.label);
                  router.push({ pathname: '/search/find', params: { q: g.label } });
                }}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.page, paddingBottom: CONTENT_BOTTOM_PADDING },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 52,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: '#FFFFFF',
  },
  fieldText: { color: '#555', fontWeight: '600', flex: 1 },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  cell: { width: '50%', padding: spacing.xs },
});
