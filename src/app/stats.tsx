import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme, withAlpha } from '@/components/theme';
import { isGroqConfigured } from '@/lib/groq';
import { topEntries, useProfileStore } from '@/store/profileStore';
import { liveStreak, useStreakStore } from '@/store/streakStore';

function formatTime(totalSec: number): string {
  if (totalSec <= 0) return '0 min';
  if (totalSec < 60) return `${Math.round(totalSec)} sec`;
  const minutes = Math.floor(totalSec / 60);
  if (minutes < 60) return `${minutes} mins`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours} hr ${remainingMins} min`;
}

export default function StatsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const plays = useProfileStore((s) => s.plays);
  const listenedSec = useProfileStore((s) => s.listenedSec);
  const artistCounts = useProfileStore((s) => s.artistCounts);
  const genreCounts = useProfileStore((s) => s.genreCounts);
  const sourceCounts = useProfileStore((s) => s.sourceCounts);
  const history = useProfileStore((s) => s.history);

  const currentStreak = useStreakStore((s) => s.current);
  const lastDay = useStreakStore((s) => s.lastDay);
  const streak = liveStreak({ current: currentStreak, lastDay });

  const groqConnected = isGroqConfigured();

  const topArtists = topEntries(artistCounts, 10);
  const topGenres = topEntries(genreCounts, 8);
  const topGenreMax = topGenres[0]?.[1] ?? 1;

  // Most active source
  const topSource = topEntries(sourceCounts, 1)[0];

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={[type.heading, { color: colors.text }]}>
          Listening Stats
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* GROQ AI Status Banner */}
        <View
          style={[
            styles.groqCard,
            {
              backgroundColor: groqConnected
                ? withAlpha(colors.accent, 0.12)
                : withAlpha(colors.danger, 0.1),
              borderColor: groqConnected
                ? withAlpha(colors.accent, 0.35)
                : withAlpha(colors.danger, 0.3),
            },
          ]}
        >
          <View style={styles.groqHeader}>
            <View style={styles.groqTitleRow}>
              <Ionicons
                name={groqConnected ? 'sparkles' : 'alert-circle'}
                size={20}
                color={groqConnected ? colors.accent : colors.danger}
              />
              <Text
                style={[
                  type.bodyStrong,
                  { color: groqConnected ? colors.accent : colors.danger },
                ]}
              >
                GROQ AI RECOMMENDATION
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: groqConnected ? colors.accent : colors.danger,
                },
              ]}
            >
              <Text style={[type.micro, { color: colors.onAccent, fontWeight: '800' }]}>
                {groqConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </Text>
            </View>
          </View>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            {groqConnected
              ? 'Model: Llama 3.3 (70B) — Active & ready. Intelligently predicts and queues next songs based on your taste.'
              : 'AI recommendations are offline right now. Autoplay still works with SONIQ\'s built-in picks.'}
          </Text>
        </View>

        {/* Key Metrics Grid */}
        <View style={styles.grid}>
          <View style={[styles.gridCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="time-outline" size={24} color={colors.accent} />
            <Text style={[styles.bigNum, { color: colors.text }]}>{formatTime(listenedSec)}</Text>
            <Text style={[type.micro, { color: colors.textMuted }]}>TOTAL LISTENING TIME</Text>
          </View>

          <View style={[styles.gridCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="musical-notes-outline" size={24} color={colors.accent} />
            <Text style={[styles.bigNum, { color: colors.text }]}>{plays}</Text>
            <Text style={[type.micro, { color: colors.textMuted }]}>TRACKS PLAYED</Text>
          </View>

          <View style={[styles.gridCard, { backgroundColor: colors.surface }]}>
            <Text style={styles.fireEmoji}>🔥</Text>
            <Text style={[styles.bigNum, { color: colors.text }]}>{streak} Days</Text>
            <Text style={[type.micro, { color: colors.textMuted }]}>CURRENT STREAK</Text>
          </View>

          <View style={[styles.gridCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="radio-outline" size={24} color={colors.accent} />
            <Text style={[styles.bigNum, { color: colors.text }]} numberOfLines={1}>
              {topSource ? topSource[0].toUpperCase() : 'None'}
            </Text>
            <Text style={[type.micro, { color: colors.textMuted }]}>TOP SOURCE</Text>
          </View>
        </View>

        {/* Loved Genres Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="heart-circle-outline" size={20} color={colors.accent} />
            <Text style={[type.title, { color: colors.text }]}>Loved Genres</Text>
          </View>
          {topGenres.length === 0 ? (
            <Text style={[type.caption, { color: colors.textMuted, fontStyle: 'italic' }]}>
              Play more songs to uncover your favorite genres.
            </Text>
          ) : (
            <View style={styles.genreList}>
              {topGenres.map(([genre, count], idx) => {
                const pct = Math.round((count / topGenreMax) * 100);
                return (
                  <View key={genre} style={styles.genreItem}>
                    <View style={styles.genreItemRow}>
                      <Text style={[type.bodyStrong, { color: colors.text }]}>
                        #{idx + 1} {genre}
                      </Text>
                      <Text style={[type.caption, { color: colors.textMuted }]}>
                        {count} {count === 1 ? 'play' : 'plays'}
                      </Text>
                    </View>
                    <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceHigh }]}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${pct}%`, backgroundColor: colors.accent },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Top Artists Section */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people-outline" size={20} color={colors.accent} />
            <Text style={[type.title, { color: colors.text }]}>Top Artists</Text>
          </View>
          {topArtists.length === 0 ? (
            <Text style={[type.caption, { color: colors.textMuted, fontStyle: 'italic' }]}>
              Your top artists will appear here as you listen.
            </Text>
          ) : (
            <View style={styles.artistList}>
              {topArtists.map(([artist, count], idx) => (
                <View
                  key={artist}
                  style={[
                    styles.artistRow,
                    idx < topArtists.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.rankCircle,
                      {
                        backgroundColor: idx === 0 ? colors.accent : colors.surfaceHigh,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        type.caption,
                        {
                          color: idx === 0 ? colors.onAccent : colors.text,
                          fontWeight: '800',
                        },
                      ]}
                    >
                      {idx + 1}
                    </Text>
                  </View>
                  <Text style={[type.body, styles.artistName, { color: colors.text }]} numberOfLines={1}>
                    {artist}
                  </Text>
                  <Text style={[type.caption, { color: colors.textMuted }]}>
                    {count} {count === 1 ? 'track' : 'tracks'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Recent History Highlight */}
        {history.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="disc-outline" size={20} color={colors.accent} />
              <Text style={[type.title, { color: colors.text }]}>Recent Activity</Text>
            </View>
            <View style={styles.artistList}>
              {history.slice(0, 5).map((rec, i) => (
                <View
                  key={`${rec.trackId}-${rec.at}-${i}`}
                  style={[
                    styles.historyRow,
                    i < 4 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.historyInfo}>
                    <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {rec.title}
                    </Text>
                    <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                      {rec.artist}
                    </Text>
                  </View>
                  {rec.listenedSec ? (
                    <Text style={[type.micro, { color: colors.accent }]}>
                      Heard {Math.round(rec.listenedSec)}s
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page - 10,
    gap: spacing.xs,
  },
  content: {
    paddingHorizontal: spacing.page,
    paddingBottom: CONTENT_BOTTOM_PADDING,
    gap: spacing.md,
  },
  groqCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  groqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groqTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  bigNum: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  fireEmoji: {
    fontSize: 24,
  },
  sectionCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  genreList: {
    gap: spacing.sm,
  },
  genreItem: {
    gap: 4,
  },
  genreItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressBarBg: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  artistList: {
    gap: 2,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistName: {
    flex: 1,
    fontWeight: '600',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  historyInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
});
