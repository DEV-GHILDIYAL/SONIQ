import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Track } from '@/sources/types';
import { joinJam } from '@/jam/session';
import { useFriendLists } from '@/lib/friends';
import { jumpTo, removeFromQueue } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { useIsLiked, useLikedStore } from '@/store/likedStore';
import { usePlayerStore } from '@/store/playerStore';
import { Artwork } from '../Artwork';
import { UserAvatar } from '../UserAvatar';
import { colorFor, radius, spacing, type, useTheme, withAlpha } from '../theme';
import { useDesktopStore, type PanelTab } from './desktopStore';
import { hov } from './useIsDesktop';

export const RIGHT_PANEL_WIDTH = 320;

function Tabs() {
  const { colors } = useTheme();
  const tab = useDesktopStore((s) => s.panelTab);
  const items: { id: PanelTab; label: string }[] = [
    { id: 'queue', label: 'Up next' },
    { id: 'friends', label: 'Friends' },
  ];
  return (
    <View style={[styles.tabs, { backgroundColor: colors.surfaceHigh }]}>
      {items.map((t) => {
        const on = t.id === tab;
        return (
          <Pressable
            key={t.id}
            onPress={() => useDesktopStore.getState().setPanelTab(t.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.tab, on && { backgroundColor: colors.background }]}
          >
            <Text
              style={[
                type.caption,
                { color: on ? colors.text : colors.textMuted, fontWeight: '700' },
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => useDesktopStore.getState().togglePanel()}
        accessibilityRole="button"
        accessibilityLabel="Close panel"
        style={styles.close}
      >
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/** Now playing: the cover over a soft wash of its colour, with like. */
function NowPlaying() {
  const { colors } = useTheme();
  const router = useRouter();
  const track = usePlayerStore((s) => currentTrack(s.queue));
  const liked = useIsLiked(track?.id);
  if (!track) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.surfaceHigh }]}>
        <Ionicons name="musical-notes-outline" size={28} color={colors.textFaint} />
        <Text style={[type.caption, { color: colors.textMuted, textAlign: 'center' }]}>
          Nothing playing. Pick a song, a mix or start the DJ.
        </Text>
      </View>
    );
  }
  const tint = colorFor(track.id);
  const open = () => router.push('/player');
  return (
    <View style={[styles.now, { backgroundColor: withAlpha(tint, 0.25) }]}>
      {track.artworkUrl ? (
        <Image
          source={{ uri: track.artworkUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={40}
        />
      ) : null}
      <LinearGradient
        colors={[withAlpha(colors.surface, 0.2), withAlpha(colors.surface, 0.92)]}
        style={StyleSheet.absoluteFill}
      />
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel="Open player">
        <Artwork seed={track.id} uri={track.artworkUrl} size={RIGHT_PANEL_WIDTH - 64} />
      </Pressable>
      <View style={styles.nowText}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="Open player"
          style={styles.flex}
        >
          <Text style={[type.heading, { color: colors.text }]} numberOfLines={2}>
            {track.title}
          </Text>
          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {track.artist}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => useLikedStore.getState().toggle(track)}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
          hitSlop={8}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={24}
            color={liked ? colors.accent : colors.text}
          />
        </Pressable>
      </View>
    </View>
  );
}

/** One queue row; the remove button is a sibling of the play button, shown on hover. */
function UpNextRow({ track, index }: { track: Track; index: number }) {
  const { colors } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <View
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={[styles.row, { backgroundColor: hover ? colors.surfaceHigh : 'transparent' }]}
    >
      <Pressable
        onPress={() => void jumpTo(index)}
        accessibilityRole="button"
        accessibilityLabel={`Play ${track.title}`}
        style={styles.rowMain}
      >
        <Artwork seed={track.id} uri={track.artworkUrl} size={40} />
        <View style={styles.flex}>
          <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
      </Pressable>
      {hover ? (
        <Pressable
          onPress={() => removeFromQueue(index)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${track.title} from queue`}
          hitSlop={6}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function UpNext() {
  const { colors } = useTheme();
  const queue = usePlayerStore((s) => s.queue);
  const recommended = usePlayerStore((s) => s.recommendedIds);
  const upcoming = queue.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ index }) => index > queue.index)
    .slice(0, 40);

  return (
    <View style={styles.section}>
      <NowPlaying />
      <Text style={[type.micro, styles.heading, { color: colors.textMuted }]}>
        {upcoming.length > 0 ? `UP NEXT · ${upcoming.length}` : 'UP NEXT'}
      </Text>
      {upcoming.length === 0 ? (
        <Text style={[type.caption, { color: colors.textFaint }]}>
          Nothing queued. Autoplay picks songs for you when the queue ends.
        </Text>
      ) : null}
      {upcoming.map(({ track, index }, i) => {
        const rec = recommended.includes(track.id);
        const firstRec = rec && (i === 0 || !recommended.includes(upcoming[i - 1]?.track.id ?? ''));
        return (
          <View key={`${track.id}:${index}`}>
            {firstRec ? (
              <Text style={[type.micro, styles.heading, { color: colors.accent }]}>
                RECOMMENDED FOR YOU
              </Text>
            ) : null}
            <UpNextRow track={track} index={index} />
          </View>
        );
      })}
    </View>
  );
}

function Friends() {
  const { colors } = useTheme();
  const router = useRouter();
  const { friends, incoming } = useFriendLists();
  const live = friends.filter((f) => f.jam);
  const rest = friends.filter((f) => !f.jam);

  return (
    <View style={styles.section}>
      {incoming.length > 0 ? (
        <Pressable
          onPress={() => router.push('/friends')}
          accessibilityRole="button"
          style={[styles.requests, { backgroundColor: withAlpha(colors.accent, 0.14) }]}
        >
          <Ionicons name="person-add" size={18} color={colors.accent} />
          <Text style={[type.bodyStrong, styles.flex, { color: colors.text }]}>
            {incoming.length} friend request{incoming.length === 1 ? '' : 's'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <Text style={[type.micro, styles.heading, { color: colors.textMuted }]}>LISTENING NOW</Text>
      {live.length === 0 ? (
        <Text style={[type.caption, { color: colors.textFaint }]}>
          No friend is in a public Jam right now.
        </Text>
      ) : null}
      {live.map((f) => (
        <View key={f.id} style={styles.row}>
          <Pressable onPress={() => router.push(`/user/${f.id}`)} accessibilityRole="button">
            <UserAvatar id={f.id} name={f.name} size={40} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
              {f.name}
            </Text>
            <Text style={[type.caption, { color: colors.accent }]} numberOfLines={1}>
              {f.jam?.title ? `♪ ${f.jam.title}` : 'In a Jam'} · {f.jam?.members ?? 1} listening
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (f.jam) void joinJam(f.jam.code).catch(() => undefined);
              router.push('/jam');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Join ${f.name}'s Jam`}
            style={[styles.join, { backgroundColor: colors.accent }]}
          >
            <Text style={[type.caption, { color: colors.onAccent, fontWeight: '800' }]}>Join</Text>
          </Pressable>
        </View>
      ))}

      <Text style={[type.micro, styles.heading, { color: colors.textMuted }]}>
        FRIENDS · {friends.length}
      </Text>
      {rest.map((f) => (
        <Pressable
          key={f.id}
          onPress={() => router.push(`/user/${f.id}`)}
          accessibilityRole="button"
          style={(s) => [
            styles.row,
            { backgroundColor: hov(s) ? colors.surfaceHigh : 'transparent' },
          ]}
        >
          <UserAvatar id={f.id} name={f.name} size={36} />
          <Text style={[type.body, styles.flex, { color: colors.text }]} numberOfLines={1}>
            {f.name}
          </Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => router.push('/friends')}
        accessibilityRole="button"
        style={[styles.add, { borderColor: colors.border }]}
      >
        <Ionicons name="person-add-outline" size={16} color={colors.text} />
        <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>Add friends</Text>
      </Pressable>
    </View>
  );
}

/** Desktop right side: what's playing + up next, or your friends and their Jams. */
export function RightPanel() {
  const { colors } = useTheme();
  const tab = useDesktopStore((s) => s.panelTab);
  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, borderLeftColor: colors.border }]}
    >
      <Tabs />
      <ScrollView contentContainerStyle={styles.scroll}>
        {tab === 'queue' ? <UpNext /> : <Friends />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  root: { width: RIGHT_PANEL_WIDTH, borderLeftWidth: StyleSheet.hairlineWidth },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.md,
    padding: 3,
    borderRadius: radius.pill,
  },
  tab: {
    flex: 1,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  section: { gap: 2 },
  heading: { marginTop: spacing.lg, marginBottom: spacing.xs },
  now: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    alignItems: 'center',
  },
  nowText: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
  empty: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: 6,
    borderRadius: radius.md,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  requests: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  join: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: spacing.md,
  },
});
