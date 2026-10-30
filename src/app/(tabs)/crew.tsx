import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClansView } from '@/components/ClansView';
import { IconButton } from '@/components/IconButton';
import { JamPanel } from '@/components/JamPanel';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { showSheet } from '@/components/Sheet';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme } from '@/components/theme';
import { joinJam } from '@/jam/session';
import { CODE_LENGTH, normalizeCode } from '@/jam/sync';
import { tapHaptic } from '@/lib/haptics';
import { useClans } from '@/lib/clans';
import { friendsAvailable, refreshFriends } from '@/lib/friends';
import { useJamStore } from '@/store/jamStore';

type Section = 'jam' | 'clans';

/** Jam + Clans in one tab: listen together, and the crews you do it with. */
export default function CrewScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  // soniq://jam?code=ABC123 arrives as /crew?tab=jam&code=ABC123 (see jam.tsx).
  const params = useLocalSearchParams<{ tab?: string; code?: string }>();
  const [section, setSection] = useState<Section>(params.tab === 'clans' ? 'clans' : 'jam');
  const [seenTab, setSeenTab] = useState(params.tab);
  if (params.tab !== seenTab) {
    setSeenTab(params.tab);
    if (params.tab === 'jam' || params.tab === 'clans') setSection(params.tab);
  }
  const unread = useClans().reduce((sum, c) => sum + c.unread, 0);
  const jamLive = useJamStore((s) => s.status !== 'idle');

  useEffect(() => {
    const code = normalizeCode(params.code ?? '');
    if (code.length !== CODE_LENGTH) return;
    router.setParams({ code: '' });
    const jam = useJamStore.getState();
    if (jam.code === code && jam.status !== 'idle') return;
    showSheet('Join this Jam?', `Listen together, in sync. Code ${code}`, [
      { text: 'Join', icon: 'headset', onPress: () => void joinJam(code).catch(() => {}) },
      { text: 'Not now', style: 'cancel' },
    ]);
  }, [params.code, router]);

  // See which friends are in a public Jam.
  useFocusEffect(
    useCallback(() => {
      if (friendsAvailable()) refreshFriends().catch(() => undefined);
    }, []),
  );

  const pick = (s: Section) => {
    if (s === section) return;
    tapHaptic();
    setSection(s);
  };

  const segment = (
    s: Section,
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    badge?: string,
  ) => {
    const on = section === s;
    return (
      <Pressable
        key={s}
        onPress={() => pick(s)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={[styles.segment, on && { backgroundColor: colors.accent }]}
      >
        <Ionicons name={icon} size={16} color={on ? colors.onAccent : colors.textMuted} />
        <Text style={[type.bodyStrong, { color: on ? colors.onAccent : colors.textMuted }]}>
          {label}
        </Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: on ? colors.onAccent : colors.accent }]}>
            <Text style={[styles.badgeText, { color: on ? colors.accent : colors.onAccent }]}>
              {badge}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Screen>
      <ScreenHeader
        title="Crew"
        subtitle={section === 'jam' ? 'Listen together, in sync' : 'Your people, your music'}
        right={
          friendsAvailable() ? (
            <IconButton
              icon="people-outline"
              label="Friends"
              onPress={() => router.push('/friends')}
            />
          ) : undefined
        }
      />
      <View
        style={[styles.switch, { backgroundColor: colors.surface }]}
        accessibilityRole="tablist"
      >
        {segment('jam', 'Jam', 'headset', jamLive ? 'LIVE' : undefined)}
        {segment(
          'clans',
          'Clans',
          'shield',
          unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined,
        )}
      </View>

      {section === 'jam' ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <JamPanel />
        </ScrollView>
      ) : (
        <ClansView />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switch: {
    flexDirection: 'row',
    marginHorizontal: spacing.page,
    marginBottom: spacing.md,
    padding: 4,
    borderRadius: radius.pill,
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  badge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  content: { paddingBottom: CONTENT_BOTTOM_PADDING },
});
