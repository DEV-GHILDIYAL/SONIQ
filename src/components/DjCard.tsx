import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { startDJ, stopDJ, switchItUp } from '@/lib/dj';
import { pressHaptic } from '@/lib/haptics';
import { useDjStore } from '@/store/djStore';
import { showSheet } from './Sheet';
import { radius, spacing, type, useTheme } from './theme';

/** "SONIQ DJ" tile: start the DJ, or (while on) switch it up / stop. */
export function DjCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const active = useDjStore((s) => s.active);
  const busy = useDjStore((s) => s.busy);
  const segment = useDjStore((s) => s.segment);

  const onPress = () => {
    pressHaptic();
    if (active) {
      showSheet('SONIQ DJ', segment ? `Now: ${segment.label}` : undefined, [
        { text: 'Switch it up', icon: 'shuffle', onPress: () => void switchItUp() },
        {
          text: 'Open player',
          icon: 'musical-notes-outline',
          onPress: () => router.push('/player'),
        },
        { text: 'Stop DJ', icon: 'stop-circle-outline', style: 'destructive', onPress: stopDJ },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    startDJ()
      .then(() => router.push('/player'))
      .catch((err: unknown) =>
        showSheet('DJ couldn’t start', err instanceof Error ? err.message : String(err)),
      );
  };

  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? 'SONIQ DJ is on. Options' : 'Start SONIQ DJ'}
      style={({ pressed }) => [styles.wrap, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <LinearGradient
        colors={['#1D1B3A', '#5B2A86', '#E0567A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.top}>
          <Ionicons name="radio" size={18} color="#FFFFFF" />
          {active ? (
            <View style={styles.live}>
              <View style={styles.dot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        {busy ? <ActivityIndicator color="#FFFFFF" style={styles.spinner} /> : null}
        <Text style={styles.name}>SONIQ DJ</Text>
      </LinearGradient>
      <Text style={[type.caption, styles.sub, { color: colors.textMuted }]} numberOfLines={2}>
        {busy
          ? 'Getting your set ready…'
          : active
            ? (segment?.label ?? 'Playing for you')
            : 'Your AI DJ. Tap to start'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 148 },
  card: {
    width: 148,
    height: 148,
    borderRadius: radius.md,
    padding: spacing.sm,
    justifyContent: 'space-between',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF4D5E' },
  liveText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  spinner: { alignSelf: 'center' },
  name: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  sub: { marginTop: spacing.xs },
});
