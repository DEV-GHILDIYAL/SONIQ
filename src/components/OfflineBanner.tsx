import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStore } from '@/lib/network';
import { spacing, type, useTheme } from './theme';

const BACK_ONLINE_MS = 2500;

/** Thin strip at the top: "Offline" while there is no internet, then "Back online" briefly. */
export function OfflineBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const offline = useNetworkStore((s) => s.offline);
  const backAt = useNetworkStore((s) => s.backAt);
  // The "Back online" note hides itself: the timer only forces one re-render later.
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);
  useEffect(() => {
    if (!backAt) return;
    const t = setTimeout(() => setHiddenAt(backAt), BACK_ONLINE_MS);
    return () => clearTimeout(t);
  }, [backAt]);
  const showBack = !!backAt && hiddenAt !== backAt;

  if (!offline && !showBack) return null;
  const bg = offline ? colors.surfaceHigh : colors.accent;
  const fg = offline ? colors.text : colors.onAccent;

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.bar, { paddingTop: insets.top + 4, backgroundColor: bg }]}
    >
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'cloud-done-outline'}
        size={14}
        color={fg}
      />
      <Text style={[type.caption, { color: fg, fontWeight: '700' }]}>
        {offline ? 'Offline · only saved songs play' : 'Back online'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingBottom: 5,
  },
});
