import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type, useTheme, withAlpha } from './theme';
import { topEntries, useProfileStore } from '@/store/profileStore';

function formatListeningTime(totalSec: number): string {
  if (totalSec <= 0) return '0m';
  if (totalSec < 60) return `${Math.round(totalSec)}s`;
  const minutes = Math.floor(totalSec / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m`;
}

export function ListeningStats() {
  const { colors } = useTheme();
  const plays = useProfileStore((s) => s.plays);
  const listenedSec = useProfileStore((s) => s.listenedSec);
  const artistCounts = useProfileStore((s) => s.artistCounts);
  const genreCounts = useProfileStore((s) => s.genreCounts);

  const topArtists = topEntries(artistCounts, 5);
  const topGenres = topEntries(genreCounts, 5);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Ionicons name="stats-chart" size={18} color={colors.accent} />
        <Text style={[type.micro, { color: colors.textMuted }]}>SONIQ INSIGHTS & STATS</Text>
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { backgroundColor: colors.surfaceHigh }]}>
          <Ionicons name="time-outline" size={20} color={colors.accent} />
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {formatListeningTime(listenedSec)}
          </Text>
          <Text style={[type.micro, { color: colors.textMuted }]}>TIME LISTENED</Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.surfaceHigh }]}>
          <Ionicons name="musical-notes-outline" size={20} color={colors.accent} />
          <Text style={[styles.metricValue, { color: colors.text }]}>{plays}</Text>
          <Text style={[type.micro, { color: colors.textMuted }]}>TRACKS PLAYED</Text>
        </View>
      </View>

      {topGenres.length > 0 && (
        <View style={styles.section}>
          <Text style={[type.caption, { color: colors.textMuted, marginBottom: spacing.xs }]}>
            Favorite Genres
          </Text>
          <View style={styles.chipsRow}>
            {topGenres.map(([genre, count]) => (
              <View
                key={genre}
                style={[
                  styles.chip,
                  { backgroundColor: withAlpha(colors.accent, 0.15), borderColor: withAlpha(colors.accent, 0.3) },
                ]}
              >
                <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>{genre}</Text>
                <Text style={[type.micro, { color: colors.textMuted }]}>{count}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {topArtists.length > 0 && (
        <View style={styles.section}>
          <Text style={[type.caption, { color: colors.textMuted, marginBottom: spacing.xs }]}>
            Top Artists
          </Text>
          <View style={styles.artistList}>
            {topArtists.map(([artist, count], index) => (
              <View key={artist} style={styles.artistRow}>
                <View style={[styles.rankBadge, { backgroundColor: colors.surfaceHigh }]}>
                  <Text style={[type.micro, { color: colors.accent, fontWeight: '700' }]}>
                    #{index + 1}
                  </Text>
                </View>
                <Text style={[type.body, styles.artistName, { color: colors.text }]} numberOfLines={1}>
                  {artist}
                </Text>
                <Text style={[type.caption, { color: colors.textMuted }]}>
                  {count} {count === 1 ? 'play' : 'plays'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.page,
    marginTop: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  section: {
    gap: spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  artistList: {
    gap: spacing.xs,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistName: {
    flex: 1,
    fontWeight: '600',
  },
});
