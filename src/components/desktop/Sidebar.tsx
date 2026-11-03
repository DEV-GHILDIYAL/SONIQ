import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useClans } from '@/lib/clans';
import { useFriendLists } from '@/lib/friends';
import { useLikedStore } from '@/store/likedStore';
import { usePlaylistStore } from '@/store/playlistStore';
import { useProfileStore } from '@/store/profileStore';
import { PlaylistCover } from '../PlaylistCover';
import { radius, spacing, type, useTheme, withAlpha } from '../theme';
import { goTo } from './navigate';
import { hov, SIDEBAR_WIDTH } from './useIsDesktop';

type IconName = keyof typeof Ionicons.glyphMap;

interface NavItem {
  label: string;
  href: Href;
  on: IconName;
  off: IconName;
  /** Path prefixes that count as "here". */
  match: (path: string) => boolean;
  badge?: number;
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => goTo(router, item.href)}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={(s) => [
        styles.nav,
        {
          backgroundColor: active
            ? withAlpha(colors.accent, 0.14)
            : hov(s) || s.pressed
              ? colors.surface
              : 'transparent',
        },
      ]}
    >
      <Ionicons
        name={active ? item.on : item.off}
        size={22}
        color={active ? colors.accent : colors.textMuted}
      />
      <Text
        style={[type.bodyStrong, styles.flex, { color: active ? colors.text : colors.textMuted }]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
      {item.badge ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.badgeText, { color: colors.onAccent }]}>
            {item.badge > 99 ? '99+' : item.badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Desktop navigation: main places, your playlists, and you. */
export function Sidebar() {
  const { colors } = useTheme();
  const router = useRouter();
  const path = usePathname();
  const playlists = usePlaylistStore((s) => s.playlists);
  const likedCount = useLikedStore((s) => s.tracks.length);
  const profile = useProfileStore((s) => s.profile);
  const unread = useClans().reduce((n, c) => n + c.unread, 0);
  const requests = useFriendLists().incoming.length;

  const main: NavItem[] = [
    { label: 'Home', href: '/', on: 'home', off: 'home-outline', match: (p) => p === '/' },
    {
      label: 'Search',
      href: '/search',
      on: 'search',
      off: 'search-outline',
      match: (p) => p.startsWith('/search'),
    },
    {
      label: 'Library',
      href: '/library',
      on: 'library',
      off: 'library-outline',
      match: (p) => p.startsWith('/library'),
    },
    { label: 'Jam', href: '/jam', on: 'people', off: 'people-outline', match: (p) => p === '/jam' },
    {
      label: 'Clans',
      href: '/clans',
      on: 'shield',
      off: 'shield-outline',
      match: (p) => p.startsWith('/clan'),
      badge: unread,
    },
    {
      label: 'Friends',
      href: '/friends',
      on: 'person-add',
      off: 'person-add-outline',
      match: (p) => p.startsWith('/friends'),
      badge: requests,
    },
  ];

  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, borderRightColor: colors.border }]}
    >
      <Text style={[styles.logo, { color: colors.accent }]}>SONIQ</Text>
      <View style={styles.group}>
        {main.map((item) => (
          <NavRow key={item.label} item={item} active={item.match(path)} />
        ))}
      </View>

      <Text style={[type.micro, styles.heading, { color: colors.textFaint }]}>YOUR MUSIC</Text>
      <ScrollView style={styles.flex} contentContainerStyle={styles.group}>
        <Pressable
          onPress={() => router.push('/liked')}
          accessibilityRole="link"
          style={(s) => [
            styles.playlist,
            {
              backgroundColor:
                path === '/liked'
                  ? withAlpha(colors.accent, 0.14)
                  : hov(s)
                    ? colors.surfaceHigh
                    : 'transparent',
            },
          ]}
        >
          <View style={[styles.likedIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="heart" size={16} color={colors.onAccent} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
              Liked Songs
            </Text>
            <Text style={[type.caption, { color: colors.textMuted }]}>{likedCount} songs</Text>
          </View>
        </Pressable>
        {playlists.map((p) => {
          const active = path === `/playlist/${p.id}`;
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/playlist/${p.id}`)}
              accessibilityRole="link"
              style={(s) => [
                styles.playlist,
                {
                  backgroundColor: active
                    ? withAlpha(colors.accent, 0.14)
                    : hov(s)
                      ? colors.surfaceHigh
                      : 'transparent',
                },
              ]}
            >
              <PlaylistCover seed={p.id} tracks={p.tracks} size={36} />
              <View style={styles.flex}>
                <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[type.caption, { color: colors.textMuted }]}>
                  {p.tracks.length} songs
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable
          onPress={() => goTo(router, '/profile')}
          accessibilityRole="link"
          style={(s) => [
            styles.me,
            { backgroundColor: hov(s) ? colors.surfaceHigh : 'transparent' },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
              {(profile?.name?.[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <Text style={[type.bodyStrong, styles.flex, { color: colors.text }]} numberOfLines={1}>
            {profile?.name ?? 'Profile'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={6}
          style={(s) => [
            styles.iconBtn,
            { backgroundColor: hov(s) ? colors.surfaceHigh : 'transparent' },
          ]}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
  },
  logo: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
    paddingHorizontal: spacing.lg + 4,
    marginBottom: spacing.lg,
  },
  group: { paddingHorizontal: spacing.sm, gap: 2 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  heading: { paddingHorizontal: spacing.lg + 4, marginTop: spacing.xl, marginBottom: spacing.sm },
  playlist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: 6,
    borderRadius: radius.md,
  },
  likedIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  me: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 6,
    borderRadius: radius.md,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
});
