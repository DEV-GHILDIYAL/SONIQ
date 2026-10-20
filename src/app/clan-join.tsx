import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { radius, spacing, type, useTheme } from '@/components/theme';
import { joinClan, normalizeClanCode } from '@/lib/clans';

/** Opened by a clan invite link (soniq://clan-join?code=…): confirm, then join. */
export default function ClanJoinScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = normalizeClanCode(params.code ?? '');
  const valid = /^[A-Z0-9]{8}$/.test(code);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await joinClan(code);
      router.replace(`/clan/${id}`);
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
          <Ionicons name="shield" size={40} color={colors.accent} />
        </View>
        <Text style={[type.title, styles.center, { color: colors.text }]}>
          {valid ? 'Join this clan?' : 'Invalid clan link'}
        </Text>
        <Text style={[type.body, styles.center, { color: colors.textMuted }]}>
          {valid
            ? `Clan code ${code}. Members can chat and share Jams with each other.`
            : 'Ask your friend to share the clan invite again.'}
        </Text>
        {error ? (
          <Text style={[type.caption, styles.center, { color: colors.danger }]}>{error}</Text>
        ) : null}
        {valid ? (
          <Pressable
            onPress={() => void join()}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent, opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Join clan</Text>
            )}
          </Pressable>
        ) : null}
        <Pressable onPress={goHome} accessibilityRole="button" style={styles.cancel} hitSlop={8}>
          <Text style={[type.bodyStrong, { color: colors.textMuted }]}>
            {valid ? 'Not now' : 'OK'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.page, gap: spacing.md },
  icon: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  button: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  cancel: { alignSelf: 'center', padding: spacing.md },
});
