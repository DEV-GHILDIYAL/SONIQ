import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { radius, spacing, type, useTheme } from './theme';

type Props = {
  visible: boolean;
  title: string;
  initialValue?: string;
  confirmLabel: string;
  maxLength?: number;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

/** Centered modal with a single text field (create / rename playlist). */
export function TextPrompt(props: Props) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      {/* Body mounts fresh on every open, so the field always starts from initialValue. */}
      {props.visible ? <PromptBody {...props} /> : null}
    </Modal>
  );
}

function PromptBody({ title, initialValue = '', confirmLabel, maxLength = 100, onConfirm, onCancel }: Props) {
  const { colors } = useTheme();
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}
    >
      <View style={[styles.card, { backgroundColor: colors.surfaceHigh }]}>
        <Text style={[type.title, styles.center, { color: colors.text }]}>{title}</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          autoFocus
          selectTextOnFocus
          maxLength={maxLength}
          onSubmitEditing={() => trimmed && onConfirm(trimmed)}
          style={[
            styles.input,
            type.title,
            { color: colors.text, borderBottomColor: colors.textMuted },
          ]}
          accessibilityLabel={title}
        />
        <View style={styles.actions}>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            style={[styles.button, { borderColor: colors.textFaint }]}
          >
            <Text style={[type.bodyStrong, { color: colors.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => trimmed && onConfirm(trimmed)}
            disabled={!trimmed}
            accessibilityRole="button"
            accessibilityState={{ disabled: !trimmed }}
            style={[
              styles.button,
              styles.primary,
              { backgroundColor: colors.accent, opacity: trimmed ? 1 : 0.4 },
            ]}
          >
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.xl },
  center: { textAlign: 'center' },
  input: { borderBottomWidth: 1, paddingVertical: spacing.sm, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  button: {
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { borderWidth: 0 },
});
