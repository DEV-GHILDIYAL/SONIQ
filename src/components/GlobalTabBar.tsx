import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { tapHaptic } from '@/lib/haptics';
import { useClans } from '@/lib/clans';
import { TAB_BAR_HEIGHT, useTheme } from './theme';

type IconName = keyof typeof Ionicons.glyphMap;

export type TabName = '(home)' | 'search' | 'jam' | 'clans' | 'library';

/** The bottom tabs, in order. Keep in sync with src/app/(tabs)/_layout.tsx. */
export const TABS: { name: TabName; title: string; href: Href; on: IconName; off: IconName }[] = [
  { name: '(home)', title: 'Home', href: '/', on: 'home', off: 'home-outline' },
  { name: 'search', title: 'Search', href: '/search', on: 'search', off: 'search-outline' },
  { name: 'jam', title: 'Jam', href: '/jam', on: 'people', off: 'people-outline' },
  { name: 'clans', title: 'Clans', href: '/clans', on: 'shield', off: 'shield-outline' },
  { name: 'library', title: 'Library', href: '/library', on: 'library', off: 'library-outline' },
];

/**
 * Pages opened on top of the tabs that still show the tab bar (and the mini player above it).
 * Left out on purpose: the full player and queue (modals), restore / friend / clan-join
 * (one-off flows) and the clan chat (its message box sits at the bottom).
 */
const PAGES_WITH_TAB_BAR = new Set([
  'playlist',
  'liked',
  'album',
  'artist',
  'mix',
  'community',
  'ai-playlist',
  'settings',
  'stats',
  'about',
  'appearance',
]);

/** Which tab the user was on before opening a page, so the bar can highlight it. */
export const useLastTab = create<{ tab: TabName; set: (tab: TabName) => void }>((set) => ({
  tab: '(home)',
  set: (tab) => set({ tab }),
}));

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/** True on a stacked page that should show the tab bar right now (hidden while typing). */
export function useShowsGlobalTabBar(): boolean {
  const segments = useSegments() as string[];
  const keyboard = useKeyboardOpen();
  return PAGES_WITH_TAB_BAR.has(segments[0] ?? '') && !keyboard;
}

/** Full height of the bar including the gesture / nav-bar area. */
export function useTabBarHeight(): number {
  return TAB_BAR_HEIGHT + useSafeAreaInsets().bottom;
}

/**
 * The same tab bar as the tabs screen, drawn on pages opened on top of it (playlist,
 * album, settings…), so navigation looks and works the same everywhere.
 */
export function GlobalTabBar() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const show = useShowsGlobalTabBar();
  const active = useLastTab((s) => s.tab);
  const unread = useClans().reduce((sum, c) => sum + c.unread, 0);
  if (!show) return null;

  const go = (href: Href) => {
    tapHaptic();
    // Close the pages on top, then switch to the tab.
    if (router.canDismiss()) router.dismissAll();
    router.navigate(href);
  };

  return (
    <View
      style={[
        styles.bar,
        {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      ]}
    >
      {TABS.map((t) => {
        const focused = t.name === active;
        const color = focused ? colors.accent : colors.textMuted;
        const badge =
          t.name === 'clans' && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null;
        return (
          <Pressable
            key={t.name}
            onPress={() => go(t.href)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t.title}
            style={styles.item}
          >
            <View>
              <Ionicons name={focused ? t.on : t.off} size={24} color={color} />
              {badge ? (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.badgeText, { color: colors.onAccent }]}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color }]}>{t.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginBottom: 4, marginTop: 2 },
  badge: {
    position: 'absolute',
    top: -4,
    left: 14,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
