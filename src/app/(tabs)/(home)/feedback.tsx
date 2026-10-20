import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme } from '@/components/theme';
import { FEEDBACK_CATEGORIES, sendFeedback, type FeedbackCategory } from '@/lib/feedback';

const MAX = 1000;

/** "What should SONIQ add next?" form. Answers land in Supabase → feedback. */
export default function FeedbackScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [category, setCategory] = useState<FeedbackCategory>('New feature');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const ready = message.trim().length >= 3 && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await sendFeedback(category, message);
      setSent(true);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {sent ? (
            <View style={styles.done}>
              <Text style={styles.doneEmoji}>🙌</Text>
              <Text style={[type.title, { color: colors.text }]}>Thanks! Got it.</Text>
              <Text style={[type.body, styles.center, { color: colors.textMuted }]}>
                Your idea went straight to the SONIQ team. The best ones show up in a future update.
              </Text>
              <Pressable
                onPress={() => setSent(false)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.button, { backgroundColor: colors.surfaceHigh, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[type.bodyStrong, { color: colors.text }]}>Send another</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text accessibilityRole="header" style={[type.display, { color: colors.text }]}>
                Shape SONIQ
              </Text>
              <Text style={[type.body, { color: colors.textMuted }]}>
                What should we add or fix next? Every message is read.
              </Text>

              <Text style={[type.micro, styles.label, { color: colors.textMuted }]}>WHAT IS IT ABOUT?</Text>
              <View style={styles.chips}>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
                ))}
              </View>

              <Text style={[type.micro, styles.label, { color: colors.textMuted }]}>YOUR IDEA</Text>
              <TextInput
                value={message}
                onChangeText={(t) => setMessage(t.slice(0, MAX))}
                placeholder={
                  category === 'Bug'
                    ? 'What went wrong? What were you doing when it happened?'
                    : 'e.g. "Show lyrics while a song plays" or "Let friends vote in Jam"'
                }
                placeholderTextColor={colors.placeholder}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Your idea"
                style={[styles.input, type.body, { backgroundColor: colors.surfaceHigh, color: colors.text }]}
              />
              <Text style={[type.caption, styles.counter, { color: colors.textFaint }]}>
                {message.length}/{MAX}
              </Text>

              {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}

              <Pressable
                onPress={() => void submit()}
                disabled={!ready}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: colors.accent, opacity: !ready ? 0.4 : pressed ? 0.7 : 1 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color={colors.onAccent} />
                    <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Send</Text>
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { paddingHorizontal: spacing.page - 10, paddingTop: spacing.xs },
  content: { paddingHorizontal: spacing.page, gap: spacing.sm, paddingBottom: CONTENT_BOTTOM_PADDING },
  label: { marginTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { minHeight: 140, borderRadius: radius.md, padding: spacing.md },
  counter: { alignSelf: 'flex-end' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.md,
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  done: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl },
  doneEmoji: { fontSize: 56 },
  center: { textAlign: 'center' },
});
