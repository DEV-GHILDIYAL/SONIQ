import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { flushListening } from '@/lib/listeningSync';
import { restoreLink } from '@/lib/restoreLink';
import { supabaseConfigured } from '@/lib/supabase';
import { useJamStore } from '@/store/jamStore';
import { useProfileStore } from '@/store/profileStore';
import { RestoreForm } from './RestoreForm';
import { showSheet } from './Sheet';
import { radius, spacing, type, useTheme, withAlpha } from './theme';

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

type Step = 'welcome' | 'create' | 'signin' | 'backup';

function BigButton({
  icon,
  title,
  text,
  primary,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const fg = primary ? colors.onAccent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.bigButton,
        {
          backgroundColor: primary ? colors.accent : colors.surfaceHigh,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={26} color={fg} />
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, { color: fg }]}>{title}</Text>
        <Text
          style={[
            type.caption,
            { color: primary ? withAlpha(colors.onAccent, 0.8) : colors.textMuted },
          ]}
        >
          {text}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={fg} />
    </Pressable>
  );
}

/**
 * First launch: "Create account" (name → account → save your backup) or
 * "I already have an account" (SONIQ ID + backup code). One phone at a time:
 * signing in on a new phone signs the old one out (its device secret stops working).
 */
export function Onboarding() {
  const { colors } = useTheme();
  const hydrated = useProfileHydrated();
  const profile = useProfileStore((s) => s.profile);
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState(() => useJamStore.getState().myName);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  // A backup link opened the app: let the restore screen handle it.
  const pathname = usePathname();

  if (!hydrated || pathname === '/restore') return null;
  // Keep showing the "save your backup" step right after the account was created.
  if (profile && step !== 'backup') return null;

  const ready = name.trim().length > 0;
  const create = () => {
    if (!ready) return;
    useProfileStore.getState().createProfile(name);
    void flushListening(); // create it on the server now
    setStep(supabaseConfigured() ? 'backup' : 'welcome');
  };

  const shareBackup = async () => {
    if (!profile) return;
    await Share.share({
      message:
        `My SONIQ account backup (keep it private!)\n` +
        `ID: ${profile.id}\nBackup code: ${profile.recoveryKey}\n\n` +
        `Tap to restore on a new phone:\n${restoreLink(profile.id, profile.recoveryKey)}`,
    });
    setShared(true);
  };

  const body = () => {
    if (step === 'signin') {
      return (
        <RestoreForm
          onDone={(restoredName) => {
            setStep('welcome');
            showSheet(
              `Welcome back, ${restoredName}!`,
              'Your liked songs, playlists, streak and history are back.',
            );
          }}
          onCancel={() => setStep('welcome')}
        />
      );
    }

    if (step === 'create') {
      return (
        <>
          <Pressable
            onPress={() => setStep('welcome')}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[type.title, { color: colors.text }]}>What should we call you?</Text>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            Friends see this name in Jams and clans. You can change it later in Profile.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={create}
            placeholder="Your name"
            placeholderTextColor={colors.placeholder}
            autoFocus
            maxLength={24}
            returnKeyType="done"
            accessibilityLabel="Your name"
            style={[
              styles.input,
              type.body,
              { backgroundColor: colors.surfaceHigh, color: colors.text },
            ]}
          />
          <Pressable
            onPress={create}
            disabled={!ready}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent, opacity: !ready ? 0.4 : pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Create account</Text>
          </Pressable>
        </>
      );
    }

    if (step === 'backup' && profile) {
      return (
        <>
          <View style={[styles.shield, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="shield-checkmark" size={36} color={colors.accent} />
          </View>
          <Text style={[type.title, styles.center, { color: colors.text }]}>Save your backup</Text>
          <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
            SONIQ has no email or password. This ID and backup code are the only way to get your
            account back after reinstalling or on a new phone. Keep them private.
          </Text>
          <View style={[styles.codeCard, { backgroundColor: colors.surface }]}>
            <Text style={[type.micro, { color: colors.textMuted }]}>SONIQ ID</Text>
            <Text selectable style={[styles.code, { color: colors.text }]}>
              {profile.id}
            </Text>
            <Text style={[type.micro, styles.codeGap, { color: colors.textMuted }]}>
              BACKUP CODE
            </Text>
            <Text selectable style={[styles.code, { color: colors.text }]}>
              {profile.recoveryKey}
            </Text>
          </View>
          <Pressable
            onPress={() => void shareBackup()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              styles.row,
              { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="share-social" size={20} color={colors.onAccent} />
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>
              {shared ? 'Saved ✓  Save again' : 'Save backup (e.g. WhatsApp to yourself)'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSaved((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: saved }}
            style={styles.checkRow}
          >
            <Ionicons
              name={saved ? 'checkbox' : 'square-outline'}
              size={24}
              color={saved ? colors.accent : colors.textMuted}
            />
            <Text style={[type.caption, styles.flex, { color: colors.text }]}>
              I've saved my ID and backup code somewhere safe
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setStep('welcome');
              showSheet(
                `Welcome to SONIQ, ${profile.name}!`,
                'You can find your backup any time in Profile → Account backup.',
              );
            }}
            disabled={!saved}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.surfaceHigh, opacity: !saved ? 0.4 : pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[type.bodyStrong, { color: colors.text }]}>Continue</Text>
          </Pressable>
        </>
      );
    }

    return (
      <>
        <Text style={[type.display, { color: colors.text }]}>Music, together.</Text>
        <Text style={[type.body, styles.lead, { color: colors.textMuted }]}>
          Free, ad-free music. Listen with friends in Jams and hang out in clans.
        </Text>
        <BigButton
          icon="person-add"
          title="Create account"
          text="New to SONIQ? Takes 10 seconds."
          primary
          onPress={() => setStep('create')}
        />
        {supabaseConfigured() ? (
          <BigButton
            icon="log-in-outline"
            title="I already have an account"
            text="Sign in with your SONIQ ID and backup code"
            onPress={() => setStep('signin')}
          />
        ) : null}
        <Text style={[type.caption, styles.center, styles.note, { color: colors.textFaint }]}>
          One phone at a time: signing in here signs your account out on the old phone.
        </Text>
      </>
    );
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { backgroundColor: colors.background }]}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[styles.logo, { color: colors.accent }]}>SONIQ</Text>
          {body()}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  root: { flex: 1 },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  logo: { fontSize: 18, fontWeight: '900', letterSpacing: 4, marginBottom: spacing.lg },
  lead: { marginBottom: spacing.lg, lineHeight: 22 },
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 76,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  note: { marginTop: spacing.md },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  input: {
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  shield: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: 2,
    marginVertical: spacing.sm,
  },
  codeGap: { marginTop: spacing.md },
  code: { fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
