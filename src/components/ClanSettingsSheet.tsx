import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CLAN_EMOJIS, CLAN_MAX_MEMBERS, updateClan } from '@/lib/clans';
import { radius, spacing, type, useTheme } from './theme';

interface Values {
  name: string;
  emoji: string;
  description: string;
  maxMembers: number;
}

interface Props {
  visible: boolean;
  clanId: string;
  initial: Values;
  memberCount: number;
  onClose: () => void;
}

/** Owner-only clan settings: name, emoji, one-line description and member cap. */
export function ClanSettingsSheet(props: Props) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      {/* Mounts fresh on every open, so the fields start from the clan's current values. */}
      {props.visible ? <Body {...props} /> : null}
    </Modal>
  );
}

function Body({ clanId, initial, memberCount, onClose }: Props) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial.name);
  const [emoji, setEmoji] = useState(initial.emoji);
  const [description, setDescription] = useState(initial.description);
  const [max, setMax] = useState(initial.maxMembers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minMax = Math.max(2, memberCount);
  const emojis = CLAN_EMOJIS.includes(initial.emoji)
    ? CLAN_EMOJIS
    : [initial.emoji, ...CLAN_EMOJIS];
  const valid = name.trim().length >= 2;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateClan(clanId, {
        name: name.trim() !== initial.name ? name.trim() : undefined,
        emoji: emoji !== initial.emoji ? emoji : undefined,
        description: description.trim() !== initial.description ? description.trim() : undefined,
        maxMembers: max !== initial.maxMembers ? max : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const step = (d: number) => setMax((m) => Math.min(CLAN_MAX_MEMBERS, Math.max(minMax, m + d)));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}
    >
      <View style={[styles.card, { backgroundColor: colors.surfaceHigh }]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[type.title, styles.center, { color: colors.text }]}>Clan settings</Text>
          <View style={[styles.bigEmoji, { backgroundColor: colors.accentSoft }]}>
            <Text style={styles.bigEmojiText}>{emoji}</Text>
          </View>

          <Text style={[type.micro, { color: colors.textMuted }]}>NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Clan name"
            placeholderTextColor={colors.placeholder}
            maxLength={30}
            style={[
              styles.input,
              type.body,
              { backgroundColor: colors.surface, color: colors.text },
            ]}
          />

          <Text style={[type.micro, { color: colors.textMuted }]}>DESCRIPTION</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="One line about your clan"
            placeholderTextColor={colors.placeholder}
            maxLength={80}
            style={[
              styles.input,
              type.body,
              { backgroundColor: colors.surface, color: colors.text },
            ]}
          />

          <Text style={[type.micro, { color: colors.textMuted }]}>EMOJI</Text>
          <View style={styles.emojiGrid}>
            {emojis.map((e) => (
              <Pressable
                key={e}
                onPress={() => setEmoji(e)}
                accessibilityRole="radio"
                accessibilityState={{ checked: e === emoji }}
                style={[
                  styles.emojiCell,
                  { backgroundColor: e === emoji ? colors.accentSoft : colors.surface },
                  e === emoji && { borderColor: colors.accent, borderWidth: 1.5 },
                ]}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[type.micro, { color: colors.textMuted }]}>MAX MEMBERS</Text>
          <View style={[styles.stepper, { backgroundColor: colors.surface }]}>
            <Pressable
              onPress={() => step(-1)}
              disabled={max <= minMax}
              accessibilityRole="button"
              accessibilityLabel="Fewer members"
              hitSlop={8}
              style={{ opacity: max <= minMax ? 0.3 : 1 }}
            >
              <Ionicons name="remove-circle" size={32} color={colors.accent} />
            </Pressable>
            <View style={styles.stepValue}>
              <Text style={[type.title, { color: colors.text }]}>{max}</Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                {memberCount} in the clan now
              </Text>
            </View>
            <Pressable
              onPress={() => step(1)}
              disabled={max >= CLAN_MAX_MEMBERS}
              accessibilityRole="button"
              accessibilityLabel="More members"
              hitSlop={8}
              style={{ opacity: max >= CLAN_MAX_MEMBERS ? 0.3 : 1 }}
            >
              <Ionicons name="add-circle" size={32} color={colors.accent} />
            </Pressable>
          </View>

          {error ? (
            <Text style={[type.caption, styles.center, { color: colors.danger }]}>{error}</Text>
          ) : null}

          <View style={styles.buttons}>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.btn} hitSlop={6}>
              <Text style={[type.bodyStrong, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={busy || !valid}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.btn,
                styles.primary,
                {
                  backgroundColor: colors.accent,
                  opacity: busy || !valid ? 0.4 : pressed ? 0.8 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Save</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.page,
  },
  card: { borderRadius: radius.xl, maxHeight: '90%' },
  content: { padding: spacing.xl, gap: spacing.sm },
  center: { textAlign: 'center' },
  bigEmoji: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  bigEmojiText: { fontSize: 36 },
  input: { borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  emojiCell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 22 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stepValue: { alignItems: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {},
});
