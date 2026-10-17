import { useEffect, useState } from 'react';
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
import { useJamStore } from '@/store/jamStore';
import { useProfileStore } from '@/store/profileStore';
import { radius, spacing, type, useTheme } from './theme';

function useProfileHydrated() {
  const [done, setDone] = useState(() => useProfileStore.persist.hasHydrated());
  useEffect(() => {
    if (done) return;
    const unsub = useProfileStore.persist.onFinishHydration(() => setDone(true));
    if (useProfileStore.persist.hasHydrated()) setDone(true);
    return unsub;
  }, [done]);
  return done;
}

/** First launch: ask for a name and create the profile (with its unique id). */
export function Onboarding() {
  const { colors } = useTheme();
  const hydrated = useProfileHydrated();
  const hasProfile = useProfileStore((s) => s.profile !== null);
  const [name, setName] = useState(() => useJamStore.getState().myName);

  if (!hydrated || hasProfile) return null;
  const ready = name.trim().length > 0;
  const submit = () => {
    if (ready) useProfileStore.getState().createProfile(name);
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { backgroundColor: colors.background }]}
      >
        <View style={styles.body}>
          <Text style={[styles.logo, { color: colors.accent }]}>SONIQ</Text>
          <Text style={[type.title, { color: colors.text }]}>What should we call you?</Text>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            Friends see this name in Jam. You can change it later in Profile.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={submit}
            placeholder="Your name"
            placeholderTextColor={colors.placeholder}
            autoFocus
            maxLength={24}
            returnKeyType="done"
            accessibilityLabel="Your name"
            style={[styles.input, type.body, { backgroundColor: colors.surfaceHigh, color: colors.text }]}
          />
          <Pressable
            onPress={submit}
            disabled={!ready}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent, opacity: !ready ? 0.4 : pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Let's go</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  body: { paddingHorizontal: spacing.page, gap: spacing.md },
  logo: { fontSize: 18, fontWeight: '900', letterSpacing: 4, marginBottom: spacing.lg },
  input: { height: 52, borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: spacing.md },
  button: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
