import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShowsGlobalTabBar, useTabBarHeight } from './GlobalTabBar';
import { useTheme } from './theme';

type Props = {
  children: ReactNode;
  /** Colour of the status-bar strip. Defaults to the page background. */
  topColor?: string;
};

/**
 * Page wrapper. Reserves a solid strip under the status bar / notch so scrolled
 * content never slides underneath it. Every top-level screen uses this.
 */
export function Screen({ children, topColor }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Pages on top of the tabs draw the tab bar over their bottom edge: keep content above it.
  const tabBar = useShowsGlobalTabBar();
  const tabBarHeight = useTabBarHeight();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={{ height: insets.top, backgroundColor: topColor ?? colors.background }} />
      <View style={styles.body}>{children}</View>
      {tabBar ? <View style={{ height: tabBarHeight }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, overflow: 'hidden' },
});
