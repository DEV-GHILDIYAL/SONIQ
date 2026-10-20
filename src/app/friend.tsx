import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { radius, spacing, type, useTheme } from '@/components/theme';
import { normalizeId } from '@/lib/cloudBackup';
import { sendFriendRequest } from '@/lib/friends';
import { useProfileStore } from '@/store/profileStore';

const ID = /^SQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Opened by a friend invite link (soniq://friend?id=…&name=…): confirm, then send a request. */
export default function FriendInviteScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const id = params.id ? normalizeId(params.id) : '';
  const name = (params.name ?? '').trim().slice(0, 24) || id;
  const me = useProfileStore((s) => s.profile?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = ID.test(id);
  const isMe = valid && me === id;

  const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await sendFriendRequest(id);
      router.replace('/friends');
      showSheet(
        result === 'friends' ? `You and ${name} are now friends 🎉` : 'Request sent',
        result === 'friends' ? undefined : `${name} will see it in their Friends page.`,
      );
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
          <Ionicons name="people" size={40} color={colors.accent} />
        </View>
        <Text style={[type.title, styles.center, { color: colors.text }]}>
          {!valid ? 'Invalid invite link' : isMe ? 'This is your invite link' : `Add ${name}?`}
        </Text>
        <Text style={[type.body, styles.center, { color: colors.textMuted }]}>
          {!valid
            ? 'Ask your friend to share their SONIQ invite again.'
            : isMe
              ? 'Send it to your friends so they can add you.'
              : `Send a friend request to ${id}. Friends can see when you're in a public Jam.`}
        </Text>
        {error ? <Text style={[type.caption, styles.center, { color: colors.danger }]}>{error}</Text> : null}

        {valid && !isMe ? (
          <Pressable
            onPress={() => void add()}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, { backgroundColor: colors.accent, opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Send friend request</Text>
            )}
          </Pressable>
        ) : null}
        <Pressable onPress={goHome} accessibilityRole="button" style={styles.cancel} hitSlop={8}>
          <Text style={[type.bodyStrong, { color: colors.textMuted }]}>{valid && !isMe ? 'Not now' : 'OK'}</Text>
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
