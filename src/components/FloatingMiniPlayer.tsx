import { StyleSheet, View } from 'react-native';
import { useShowsGlobalTabBar, useTabBarHeight } from './GlobalTabBar';
import { MiniPlayer } from './MiniPlayer';
import { spacing } from './theme';

/**
 * Pages opened on top of the tabs (playlist, album, …) draw their own copy of the tab bar,
 * so the tabs' mini player isn't there. This one sits right above that bar, same as on tabs.
 */
export function FloatingMiniPlayer() {
  const show = useShowsGlobalTabBar();
  const barHeight = useTabBarHeight();
  if (!show) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: barHeight + spacing.xs }]}>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0 },
});
