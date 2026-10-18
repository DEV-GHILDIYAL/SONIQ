import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { restoreAccount } from '@/lib/cloudBackup';
import { radius, spacing, type, useTheme } from './theme';

/** SONIQ ID + backup code → restores the account on this install. */
export function RestoreForm({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const { colors } = useTheme();
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = id.replace(/[^a-z0-9]/gi, '').length >= 8 && code.replace(/[^a-z0-9]/gi, '').length >= 16;
  const input = [styles.input, type.body, { backgroundColor: colors.surfaceHigh, color: colors.text }];

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await restoreAccount(id, code));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={[type.title, { color: colors.text }]}>Restore your account</Text>
      <Text style={[type.caption, { color: colors.textMuted }]}>
        Enter your SONIQ ID and backup code (from Profile on your old install). Liked songs, playlists and history
        come back. Downloads need to be downloaded again.
      </Text>
      <TextInput
        value={id}
        onChangeText={setId}
        placeholder="SONIQ ID  (SQ-XXXX-XXXX)"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel="SONIQ ID"
        style={input}
      />
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Backup code  (XXXX-XXXX-XXXX-XXXX)"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        onSubmitEditing={() => void submit()}
        accessibilityLabel="Backup code"
        style={input}
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
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Restore</Text>
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
  input: { height: 52, borderRadius: radius.md, paddingHorizontal: spacing.md, letterSpacing: 1 },
  button: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  link: { alignSelf: 'center', paddingVertical: spacing.sm },
});
