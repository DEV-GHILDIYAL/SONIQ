import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { linkThisDevice, normalizeLinkCode } from '@/lib/cloudBackup';
import { radius, spacing, type, useTheme } from './theme';

/** Name shown in the other device's "Linked devices" list. */
export function thisDeviceName(): string {
  return Platform.OS === 'web'
    ? 'Windows PC'
    : Platform.OS === 'android'
      ? 'Android phone'
      : 'Device';
}

/** Link code from the signed-in device → this device joins the same account. */
export function LinkForm({
  onDone,
  onCancel,
}: {
  onDone: (name: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = normalizeLinkCode(code).length === 8;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await linkThisDevice(code, thisDeviceName()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={[type.title, { color: colors.text }]}>Link with your phone</Text>
      <Text style={[type.caption, { color: colors.textMuted }]}>
        On your phone open Profile → Link a device and type the 8-letter code here. Your phone stays
        signed in, and both stay in sync.
      </Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Link code  (XXXX XXXX)"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        onSubmitEditing={() => void submit()}
        accessibilityLabel="Link code"
        style={[
          styles.input,
          type.title,
          { backgroundColor: colors.surfaceHigh, color: colors.text },
        ]}
      />
      {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
      <Pressable
        onPress={() => void submit()}
        disabled={!ready || busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.accent, opacity: !ready || busy ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Link</Text>
        )}
      </Pressable>
      <Pressable onPress={onCancel} accessibilityRole="button" style={styles.link} hitSlop={8}>
        <Text style={[type.caption, { color: colors.textMuted, fontWeight: '700' }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  input: {
    height: 60,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    letterSpacing: 6,
    textAlign: 'center',
  },
  button: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  link: { alignSelf: 'center', paddingVertical: spacing.sm },
});
