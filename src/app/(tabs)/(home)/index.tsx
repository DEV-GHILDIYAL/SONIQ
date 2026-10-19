import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GenreTile } from '@/components/GenreTile';
import { PlaylistCover } from '@/components/PlaylistCover';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { StreakBadge } from '@/components/Streak';
import { useProfileStore } from '@/store/profileStore';
import { IconButton } from '@/components/IconButton';
import { MediaCard } from '@/components/MediaCard';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { TrackRow } from '@/components/TrackRow';
import { openTrackActions } from '@/components/trackActionsStore';
import {
  CONTENT_BOTTOM_PADDING,
  radius,
  spacing,
  tileColors,
  type,
  useTheme,
} from '@/components/theme';
import { GENRES } from '@/lib/genres';
import { play, playQueue } from '@/player/engine';
import { usePlayerStore } from '@/store/playerStore';
import { usePlaylistStore } from '@/store/playlistStore';
import { useRecentStore } from '@/store/recentStore';

function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const recent = useRecentStore((s) => s.tracks);
  const playlists = usePlaylistStore((s) => s.playlists);
  const queue = usePlayerStore((s) => s.queue);
  const upNext = queue.tracks.slice(queue.index + 1, queue.index + 6);

  const openSearch = (q?: string) =>
    router.push(q ? { pathname: '/search/find', params: { q } } : '/search/find');

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: CONTENT_BOTTOM_PADDING }}>
        <View style={styles.header}>
          <ProfileAvatar />
          <View style={styles.flex}>
            <Text style={[type.micro, { color: colors.accent }]}>SONIQ</Text>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[type.display, { color: colors.text }]}
            >
              {greeting()}
            </Text>
          </View>
          <StreakBadge />
          <IconButton
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push('/settings')}
            style={styles.settings}
          />
        </View>

        {recent.length > 0 ? (
          <>
            <SectionHeader
              title="Recently played"
              actionLabel="Play all"
              onAction={() => void playQueue(recent, 0)}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
            >
              {recent.map((t) => (
                <MediaCard
                  key={t.id}
                  seed={t.id}
                  uri={t.artworkUrl}
                  title={t.title}
                  subtitle={t.artist}
                  onPress={() => void play(t)}
                  accessibilityLabel={`Play ${t.title} by ${t.artist}`}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        <SectionHeader
          title="Your playlists"
          actionLabel={playlists.length > 0 ? 'See all' : undefined}
          onAction={() => router.navigate('/library')}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          <Pressable
            onPress={() => router.navigate('/library')}
            accessibilityRole="button"
            accessibilityLabel="Create playlist"
            style={styles.newCard}
          >
            {({ pressed }) => (
              <>
                <View
                  style={[
                    styles.newCardArt,
                    { backgroundColor: pressed ? colors.surfaceHigh : colors.surface },
                  ]}
                >
                  <Ionicons name="add" size={36} color={colors.accent} />
                </View>
                <Text style={[type.caption, styles.cardTitle, { color: colors.text }]}>
                  New playlist
                </Text>
              </>
            )}
          </Pressable>
          {playlists.map((p) => (
            <MediaCard
              key={p.id}
              seed={p.id}
              title={p.name}
              subtitle={`${p.tracks.length} ${p.tracks.length === 1 ? 'song' : 'songs'}`}
              onPress={() => router.push(`/playlist/${p.id}`)}
              accessibilityLabel={`Open playlist ${p.name}`}
              cover={<PlaylistCover seed={p.id} tracks={p.tracks} size={132} />}
            />
          ))}
        </ScrollView>

        <Pressable
          onPress={() => router.push('/karaoke')}
          accessibilityRole="button"
          accessibilityLabel="Karaoke, coming soon"
          style={({ pressed }) => [
            styles.karaoke,
            { backgroundColor: colors.accentSoft, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={[styles.karaokeIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="mic" size={24} color={colors.onAccent} />
          </View>
          <View style={styles.karaokeText}>
            <Text style={[type.heading, { color: colors.text }]}>Karaoke</Text>
            <Text style={[type.caption, { color: colors.textMuted }]}>
              Sing along with live lyrics · Coming soon
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <SectionHeader title="Explore genres" actionLabel="See all" onAction={() => openSearch()} />
        <View style={styles.grid}>
          {GENRES.slice(0, HOME_GENRES).map((g, i) => (
            <View key={g.label} style={styles.cell}>
              <GenreTile
                label={g.label}
                icon={g.icon}
                color={tileColors[i % tileColors.length] ?? tileColors[0]}
                onPress={() => {
                  useProfileStore.getState().recordGenre(g.label);
                  openSearch(g.label);
                }}
              />
            </View>
          ))}
        </View>

        {upNext.length > 0 ? (
          <>
            <SectionHeader title="Up next" />
            {upNext.map((t) => (
              <TrackRow
                key={t.id}
                track={t}
                onPress={() => void play(t)}
                onMore={openTrackActions}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const CARD = 132;
/** Home shows a 2x2 grid; "See all" opens the full list in Search. */
const HOME_GENRES = 4;

const styles = StyleSheet.create({
  karaoke: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.page,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  karaokeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  karaokeText: { flex: 1, gap: 2 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.page,
    paddingTop: spacing.lg,
  },
  // IconButton has a 44px box; pull it so the glyph sits on the page gutter.
  settings: { marginRight: -10 },
  row: { paddingHorizontal: spacing.page, gap: spacing.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.page - spacing.xs,
  },
  cell: { width: '50%', padding: spacing.xs },
  newCard: { width: CARD },
  newCardArt: {
    width: CARD,
    height: CARD,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontWeight: '700', marginTop: spacing.sm },
});
