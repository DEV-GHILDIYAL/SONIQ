import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { radius, spacing, type, useTheme } from './theme';

/** Same shape as React Native's Alert buttons, plus an optional icon. */
export interface SheetAction {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}

interface SheetRequest {
  title: string;
  message?: string;
  actions: SheetAction[];
}

const useSheetStore = create<{ current: SheetRequest | null }>(() => ({ current: null }));

/**
 * Themed replacement for Alert.alert: a bottom sheet in the app's style.
 * Without actions it shows a single "OK".
 */
export function showSheet(title: string, message?: string, actions?: SheetAction[]): void {
  useSheetStore.setState({
    current: { title, message, actions: actions?.length ? actions : [{ text: 'OK', style: 'cancel' }] },
  });
}

/** Mounted once in the root layout. */
export function SheetHost() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const current = useSheetStore((s) => s.current);
  if (!current) return null;

  const close = () => useSheetStore.setState({ current: null });
  const press = (a: SheetAction) => {
    close();
    // May open another sheet (e.g. "Delete" → "Are you sure?").
    a.onPress?.();
  };
  const main = current.actions.filter((a) => a.style !== 'cancel');
  const cancel = current.actions.find((a) => a.style === 'cancel');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => (cancel ? press(cancel) : close())}>
      <Pressable style={styles.backdrop} onPress={() => (cancel ? press(cancel) : close())} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={[styles.handle, { backgroundColor: colors.surfacePressed }]} />
        <Text style={[type.heading, styles.title, { color: colors.text }]} numberOfLines={2}>
          {current.title}
        </Text>
        {current.message ? (
          <Text style={[type.body, styles.message, { color: colors.textMuted }]}>{current.message}</Text>
        ) : null}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {main.map((a) => {
          const danger = a.style === 'destructive';
          return (
            <Pressable
              key={a.text}
              onPress={() => press(a)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHigh }]}
            >
              {a.icon ? (
                <Ionicons name={a.icon} size={22} color={danger ? colors.danger : colors.textMuted} />
              ) : null}
              <Text style={[type.body, { color: danger ? colors.danger : colors.text, fontWeight: '600' }]}>
                {a.text}
              </Text>
            </Pressable>
          );
        })}
        {cancel ? (
          <Pressable
            onPress={() => press(cancel)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: colors.surfaceHigh, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[type.bodyStrong, { color: colors.text }]}>{cancel.text}</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.sm },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.md },
  title: { paddingHorizontal: spacing.page },
  message: { paddingHorizontal: spacing.page, marginTop: spacing.xs, lineHeight: 21 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 54, paddingHorizontal: spacing.page },
  cancel: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.page,
    marginTop: spacing.sm,
  },
});
