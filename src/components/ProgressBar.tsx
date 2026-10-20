import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { usePlayerStore } from '@/store/playerStore';
import { useTheme } from './theme';

type Props = {
  positionSec: number;
  durationSec: number;
  /** When set, tapping the bar seeks to that point. */
  onSeek?: (sec: number) => void;
  /** Thin variant without thumb (mini player). */
  thin?: boolean;
};

export function ProgressBar({ positionSec, durationSec, onSeek, thin = false }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const ratio = durationSec > 0 ? Math.min(Math.max(positionSec / durationSec, 0), 1) : 0;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const bar = (
    <View
      style={[
        styles.track,
        thin ? styles.thin : styles.thick,
        { backgroundColor: thin ? colors.surfacePressed : colors.surfaceHigh },
      ]}
    >
      <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: colors.accent }]} />
      {!thin ? (
        <View style={[styles.thumb, { left: ratio * width - 6, backgroundColor: colors.text }]} />
      ) : null}
    </View>
  );

  if (!onSeek) return <View onLayout={onLayout}>{bar}</View>;

  return (
    <Pressable
      onLayout={onLayout}
      onPress={(e) => {
        if (width > 0 && durationSec > 0) onSeek((e.nativeEvent.locationX / width) * durationSec);
      }}
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      accessibilityValue={{ min: 0, max: Math.round(durationSec), now: Math.round(positionSec) }}
      style={styles.hit}
    >
      {bar}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { paddingVertical: 14, justifyContent: 'center' },
  track: { width: '100%', borderRadius: 2, justifyContent: 'center' },
  thin: { height: 2 },
  thick: { height: 4 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
});

/**
 * Progress bar that reads the player position itself, so only this small view re-renders
 * on every position tick (not the whole player / mini player).
 */
export function LiveProgressBar({
  onSeek,
  thin,
}: {
  onSeek?: (sec: number) => void;
  thin?: boolean;
}) {
  const positionSec = usePlayerStore((s) => s.positionSec);
  const durationSec = usePlayerStore((s) => s.durationSec);
  return (
    <ProgressBar positionSec={positionSec} durationSec={durationSec} onSeek={onSeek} thin={thin} />
  );
}
