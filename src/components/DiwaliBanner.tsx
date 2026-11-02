import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DIWALI_MIXES, isDiwaliSeason, playFestivalMix, type FestivalMix } from '@/lib/festival';
import { pressHaptic } from '@/lib/haptics';
import { useProfileStore } from '@/store/profileStore';
import { useSettingsStore } from '@/store/settingsStore';
import { showSheet } from './Sheet';
import { radius, spacing, type } from './theme';

const GOLD = '#FFB627';
const MAROON = '#3A0D12';

/** A diya flame that flickers gently. */
function Flame() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  return (
    <Animated.Text style={[styles.diya, { transform: [{ scale }], opacity }]}>🪔</Animated.Text>
  );
}

/** Home banner during Diwali week: wish, 3 festive mixes and the Diwali theme. */
export function DiwaliBanner() {
  const name = useProfileStore((s) => s.profile?.name?.split(/\s+/)[0] ?? '');
  const appTheme = useSettingsStore((s) => s.appTheme);
  const [busy, setBusy] = useState<string | null>(null);
  if (!isDiwaliSeason()) return null;

  const play = async (mix: FestivalMix) => {
    if (busy) return;
    pressHaptic();
    setBusy(mix.id);
    try {
      const n = await playFestivalMix(mix);
      if (n === 0)
        showSheet(
          'Nothing found',
          'Couldn’t find songs for this mix right now. Try again in a bit.',
        );
    } finally {
      setBusy(null);
    }
  };

  return (
    <LinearGradient
      colors={[MAROON, '#5A1A12', '#8A3A10']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.head}>
        <Flame />
        <View style={styles.flex}>
          <Text style={[type.micro, { color: GOLD }]}>SHUBH DEEPAVALI</Text>
          <Text style={[type.title, styles.white]} numberOfLines={1}>
            Happy Diwali{name ? `, ${name}` : ''} ✨
          </Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mixes}
      >
        {DIWALI_MIXES.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => void play(m)}
            accessibilityRole="button"
            accessibilityLabel={`Play ${m.title}`}
            style={({ pressed }) => [styles.mix, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.mixEmoji}>{m.emoji}</Text>
            <View>
              <Text style={[type.bodyStrong, styles.white]}>{m.title}</Text>
              <Text style={[type.caption, styles.dim]}>{m.subtitle}</Text>
            </View>
            {busy === m.id ? <ActivityIndicator color={GOLD} /> : null}
          </Pressable>
        ))}
      </ScrollView>
      {appTheme !== 'diwali' ? (
        <Pressable
          onPress={() => {
            pressHaptic();
            useSettingsStore.getState().setAppTheme('diwali');
          }}
          accessibilityRole="button"
          hitSlop={6}
        >
          <Text style={[type.caption, { color: GOLD, fontWeight: '800' }]}>
            Try the Diwali theme →
          </Text>
        </Pressable>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    marginHorizontal: spacing.page,
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  diya: { fontSize: 38 },
  white: { color: '#FFF4E0' },
  dim: { color: 'rgba(255,244,224,0.7)' },
  mixes: { gap: spacing.sm },
  mix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,182,39,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,182,39,0.35)',
  },
  mixEmoji: { fontSize: 24 },
});
