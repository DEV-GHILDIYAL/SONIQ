import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue } from 'react-native';
import { radius, spacing, useTheme } from './theme';

/** One shared pulse so every skeleton on screen breathes together. */
function usePulse(): Animated.Value {
  const [v] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0.45,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [v]);
  return v;
}

function Bone({ width, height, round }: { width: DimensionValue; height: number; round?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ width, height, borderRadius: round ?? 6, backgroundColor: colors.surfaceHigh }}
    />
  );
}

/** Placeholder rows shaped like TrackRow while a list loads. */
export function TrackListSkeleton({ rows = 7, testID }: { rows?: number; testID?: string }) {
  const pulse = usePulse();
  return (
    <Animated.View
      style={{ opacity: pulse }}
      testID={testID}
      accessibilityLabel="Loading"
      accessible
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <Bone width={52} height={52} round={radius.sm} />
          <View style={styles.text}>
            <Bone width={`${70 - ((i * 13) % 30)}%`} height={14} />
            <Bone width={`${45 - ((i * 7) % 20)}%`} height={11} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/** Placeholder rows for people / clan lists (round avatar + two lines). */
export function PeopleSkeleton({ rows = 4 }: { rows?: number }) {
  const pulse = usePulse();
  return (
    <Animated.View style={{ opacity: pulse }} accessibilityLabel="Loading" accessible>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <Bone width={44} height={44} round={22} />
          <View style={styles.text}>
            <Bone width={`${55 - ((i * 11) % 20)}%`} height={14} />
            <Bone width="30%" height={11} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.sm,
    minHeight: 68,
  },
  text: { flex: 1, gap: 8 },
});
