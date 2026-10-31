import { useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from './MiniPlayer';
import { spacing } from './theme';

/**
 * Pages opened on top of the tabs (playlist, album, …) don't have the tab bar, so the tabs'
 * mini player isn't there. This one floats at the bottom of those pages instead.
 */
const PAGES_WITH_MINI = new Set([
  'playlist',
  'liked',
  'album',
  'artist',
  'mix',
  'community',
  'ai-playlist',
]);

export function FloatingMiniPlayer() {
  const segments = useSegments() as string[];
  const insets = useSafeAreaInsets();
  if (!PAGES_WITH_MINI.has(segments[0] ?? '')) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + spacing.sm }]}>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0 },
});
