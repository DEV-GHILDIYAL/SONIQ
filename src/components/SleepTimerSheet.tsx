import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { turnOffSleepTimer } from '@/player/engine';
import { sleepActive, sleepAtEndOfTrack, startSleepTimer, useSleepStore } from '@/player/sleep';
import { radius, spacing, type, useTheme } from './theme';

const OPTIONS = [15, 30, 45, 60, 90];

/** Minutes left on the sleep timer (updates every few seconds), or null. */
export function useSleepLabel(): string | null {
  const endsAt = useSleepStore((s) => s.endsAt);
  const endOfTrack = useSleepStore((s) => s.endOfTrack);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (endOfTrack) return 'End of song';
  if (endsAt === null) return null;
  const min = Math.ceil((endsAt - now) / 60_000);
  return min > 0 ? `${min} min` : 'End of song';
}

/** One option in the sheet. */
function Row({ text, onPress, danger }: { text: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHigh }]}
    >
      <Text style={[type.body, { color: danger ? colors.danger : colors.text }]}>{text}</Text>
    </Pressable>
  );
}

export function SleepTimerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const active = useSleepStore(sleepActive);
  const label = useSleepLabel();

  const pick = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.surfacePressed }]} />
        <View style={styles.title}>
          <Ionicons name="moon" size={20} color={colors.accent} />
          <Text style={[type.heading, { color: colors.text }]}>Sleep timer</Text>
        </View>
        <Text style={[type.caption, styles.hint, { color: colors.textMuted }]}>
          {active
            ? `On · ${label}. The song fades out and stops at its end.`
            : 'Music stops after the current song once time is up, with a soft fade.'}
        </Text>
        {OPTIONS.map((m) => (
          <Row key={m} text={`${m} minutes`} onPress={() => pick(() => startSleepTimer(m))} />
        ))}
        <Row text="End of this song" onPress={() => pick(sleepAtEndOfTrack)} />
        {active ? (
          <Row text="Turn off timer" danger onPress={() => pick(turnOffSleepTimer)} />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.md },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.page,
  },
  hint: { paddingHorizontal: spacing.page, marginTop: spacing.xs, marginBottom: spacing.sm },
  row: { minHeight: 50, justifyContent: 'center', paddingHorizontal: spacing.page },
});
