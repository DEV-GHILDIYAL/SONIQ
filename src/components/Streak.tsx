import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lastWeek, liveStreak, streakAtRisk, useStreakStore } from '@/store/streakStore';
import { radius, spacing, type, useTheme, withAlpha } from './theme';

/** 🔥 N pill for the Home header. Grey + "!" while today's listen is still missing. */
export function StreakBadge() {
  const { colors } = useTheme();
  const router = useRouter();
  const current = useStreakStore((s) => s.current);
  const lastDay = useStreakStore((s) => s.lastDay);
  const streak = liveStreak({ current, lastDay });
  const risk = streakAtRisk({ current, lastDay });
  if (streak === 0) return null;
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      accessibilityRole="button"
      accessibilityLabel={`${streak} day streak${risk ? ', listen today to keep it' : ''}`}
      style={({ pressed }) => [
        styles.badge,
        {
          backgroundColor: risk ? colors.surfaceHigh : withAlpha(colors.accent, 0.18),
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.fire, risk && styles.dim]}>🔥</Text>
      <Text style={[type.bodyStrong, { color: risk ? colors.textMuted : colors.accent }]}>
        {streak}
      </Text>
      {risk ? <Text style={[type.bodyStrong, { color: colors.danger }]}>!</Text> : null}
    </Pressable>
  );
}

/** Streak card for the Profile page: current, best and the last 7 days. */
export function StreakCard() {
  const { colors } = useTheme();
  const current = useStreakStore((s) => s.current);
  const best = useStreakStore((s) => s.best);
  const lastDay = useStreakStore((s) => s.lastDay);
  const days = useStreakStore((s) => s.days);
  const streak = liveStreak({ current, lastDay });
  const risk = streakAtRisk({ current, lastDay });
  const week = lastWeek(days);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardTop}>
        <Text style={styles.bigFire}>🔥</Text>
        <View style={styles.flex}>
          <Text style={[styles.count, { color: colors.text }]}>
            {streak} <Text style={[type.body, { color: colors.textMuted }]}>day streak</Text>
          </Text>
          <Text style={[type.caption, { color: risk ? colors.accent : colors.textMuted }]}>
            {streak === 0
              ? 'Listen to a song today to start a streak'
              : risk
                ? 'Listen to a song today to keep it alive!'
                : `Best: ${best} ${best === 1 ? 'day' : 'days'}`}
          </Text>
        </View>
      </View>
      <View style={styles.week}>
        {week.map((d) => (
          <View key={d.key} style={styles.day}>
            <View
              style={[styles.dot, { backgroundColor: d.done ? colors.accent : colors.surfaceHigh }]}
            >
              {d.done ? <Text style={styles.dotFire}>🔥</Text> : null}
            </View>
            <Text style={[type.micro, { color: colors.textMuted }]}>{d.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Pops in at the top when the streak grows, then slides away. Mounted in the root layout. */
export function StreakToast() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const celebrate = useStreakStore((s) => s.celebrate);
  const [y] = useState(() => new Animated.Value(-120));

  useEffect(() => {
    if (celebrate === null) return;
    Animated.sequence([
      Animated.spring(y, { toValue: 0, friction: 6, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(y, { toValue: -120, duration: 250, useNativeDriver: true }),
    ]).start(() => useStreakStore.getState().clearCelebrate());
  }, [celebrate, y]);

  if (celebrate === null) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toastWrap, { top: insets.top + spacing.sm, transform: [{ translateY: y }] }]}
    >
      <View style={[styles.toast, { backgroundColor: colors.accent }]}>
        <Text style={styles.toastFire}>🔥</Text>
        <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
          {celebrate === 1
            ? 'Streak started! Come back tomorrow'
            : `${celebrate} day streak! Keep it going`}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  fire: { fontSize: 15 },
  dim: { opacity: 0.5 },
  card: {
    marginHorizontal: spacing.page,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.lg,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bigFire: { fontSize: 40 },
  count: { fontSize: 30, fontWeight: '900' },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 6 },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dotFire: { fontSize: 14 },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 900,
    elevation: 900,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 46,
    borderRadius: radius.pill,
  },
  toastFire: { fontSize: 18 },
});
