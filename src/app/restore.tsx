import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { radius, spacing, type, useTheme } from '@/components/theme';
import { normalizeCode, normalizeId, restoreAccount } from '@/lib/cloudBackup';
import { useProfileStore } from '@/store/profileStore';

/** Opened by a backup link (soniq://restore?id=…&code=…): confirm, then restore. */
export default function RestoreScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; code?: string }>();
  const id = params.id ? normalizeId(params.id) : '';
  const code = params.code ? normalizeCode(params.code) : '';
  const current = useProfileStore((s) => s.profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sameAccount = current?.id === id;

  const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      const name = await restoreAccount(id, code);
      router.replace('/');
      showSheet(`Welcome back, ${name}!`, 'Your liked songs, playlists, streak and history are restored.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.root}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="cloud-download" size={40} color={colors.accent} />
        </View>
        <Text style={[type.title, styles.center, { color: colors.text }]}>
          {id && code ? 'Use this account?' : 'Invalid restore link'}
        </Text>
        {id && code ? (
          <>
            <Text style={[type.body, styles.center, { color: colors.textMuted }]}>
              Restore SONIQ account <Text style={{ color: colors.text, fontWeight: '700' }}>{id}</Text> on this phone.
              Liked songs, playlists, streak and history come back.
            </Text>
            {sameAccount ? (
              <Text style={[type.caption, styles.center, { color: colors.accent }]}>This account is already on this phone.</Text>
            ) : current ? (
              <Text style={[type.caption, styles.center, { color: colors.danger }]}>
                This replaces the account currently on this phone ({current.name}).
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[type.body, styles.center, { color: colors.textMuted }]}>
            The link is missing the ID or backup code. Copy it again from Profile → Account backup.
          </Text>
        )}
        {error ? <Text style={[type.caption, styles.center, { color: colors.danger }]}>{error}</Text> : null}

        {id && code && !sameAccount ? (
          <Pressable
            onPress={() => void restore()}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Yes, restore</Text>
            )}
          </Pressable>
        ) : null}
        <Pressable onPress={goHome} accessibilityRole="button" style={styles.cancel} hitSlop={8}>
          <Text style={[type.bodyStrong, { color: colors.textMuted }]}>{sameAccount ? 'OK' : 'Cancel'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.page, gap: spacing.md },
  icon: { alignSelf: 'center', width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  button: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  cancel: { alignSelf: 'center', padding: spacing.md },
});
