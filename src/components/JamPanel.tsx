import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { joinJam, leaveJam, startJam } from '@/jam/session';
import { CODE_LENGTH, normalizeCode } from '@/jam/sync';
import { realtimeConfigured } from '@/lib/realtime';
import { useJamStore } from '@/store/jamStore';
import { useProfileStore } from '@/store/profileStore';
import { radius, spacing, type, useTheme } from './theme';

function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const bg = kind === 'primary' ? colors.accent : kind === 'danger' ? 'transparent' : colors.surfaceHigh;
  const fg = kind === 'primary' ? colors.onAccent : kind === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        kind === 'danger' && { borderWidth: 1, borderColor: colors.danger },
      ]}
    >
      <Text style={[type.bodyStrong, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Start / join / manage a Jam (listen together). Rendered by the Jam tab. */
export function JamPanel() {
  const { colors } = useTheme();
  const status = useJamStore((s) => s.status);
  const role = useJamStore((s) => s.role);
  const code = useJamStore((s) => s.code);
  const members = useJamStore((s) => s.members);
  const upNext = useJamStore((s) => s.upNext);
  const notice = useJamStore((s) => s.notice);
  const error = useJamStore((s) => s.error);
  const myName = useProfileStore((s) => s.profile?.name ?? '');
  const [codeInput, setCodeInput] = useState('');

  const inputStyle = [styles.input, type.body, { backgroundColor: colors.surfaceHigh, color: colors.text }];
  const configured = realtimeConfigured();

  const share = () => {
    if (!code) return;
    void Share.share({ message: `Join my SONIQ Jam 🎧 Code: ${code}` });
  };

  return (
    <View style={styles.content}>
          <View style={styles.titleRow}>
            <Ionicons name="people" size={22} color={colors.accent} />
            <Text style={[type.caption, { color: colors.textMuted }]}>
              Listen together with friends, in sync.
            </Text>
          </View>

          {!configured ? (
            <Text style={[type.caption, { color: colors.danger }]}>
              Jam is not set up. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.
            </Text>
          ) : status === 'connecting' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <Text style={[type.caption, { color: colors.textMuted }]}>
                {role === 'guest' ? `Joining ${code}…` : 'Starting Jam…'}
              </Text>
            </View>
          ) : status === 'active' && code ? (
            <>
              <Text style={[type.micro, { color: colors.textMuted }]}>JAM CODE</Text>
              <Pressable onPress={share} accessibilityRole="button" accessibilityLabel={`Share code ${code}`}>
                <Text style={[styles.code, { color: colors.text }]}>{code}</Text>
              </Pressable>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                {role === 'host'
                  ? 'You control playback. Friends can add songs to the queue.'
                  : 'The host controls playback. Long-press a song → Add to queue to suggest it.'}
              </Text>
              {role === 'host' ? <Button label="Share code" kind="secondary" onPress={share} /> : null}

              <Text style={[type.micro, styles.section, { color: colors.textMuted }]}>
                LISTENING ({members.length})
              </Text>
              {members.map((m) => (
                <View key={m.id} style={styles.member}>
                  <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[type.bodyStrong, { color: colors.accent }]}>
                      {(m.name[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[type.body, styles.flex, { color: colors.text }]} numberOfLines={1}>
                    {m.name}
                  </Text>
                  {m.role === 'host' ? (
                    <Text style={[type.micro, { color: colors.accent }]}>HOST</Text>
                  ) : null}
                </View>
              ))}

              {upNext.length > 0 ? (
                <>
                  <Text style={[type.micro, styles.section, { color: colors.textMuted }]}>UP NEXT</Text>
                  {upNext.slice(0, 5).map((t, i) => (
                    <Text
                      key={`${t.id}-${i}`}
                      style={[type.caption, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {i + 1}. {t.title} · {t.artist}
                    </Text>
                  ))}
                </>
              ) : null}

              <Button
                label={role === 'host' ? 'End Jam' : 'Leave Jam'}
                kind="danger"
                onPress={() => void leaveJam()}
              />
            </>
          ) : (
            <>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                Friends will see you as <Text style={{ color: colors.text }}>{myName || 'Listener'}</Text>
                {' '}(change it in Profile).
              </Text>
              <Button label="Start a Jam" onPress={() => void startJam().catch(() => {})} />
              <Text style={[type.micro, styles.or, { color: colors.textMuted }]}>OR JOIN ONE</Text>
              <View style={styles.joinRow}>
                <TextInput
                  value={codeInput}
                  onChangeText={(t) => setCodeInput(normalizeCode(t).slice(0, CODE_LENGTH))}
                  placeholder="CODE"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[inputStyle, styles.flex, styles.codeInput]}
                  accessibilityLabel="Jam code"
                />
                <Button
                  label="Join"
                  disabled={codeInput.length !== CODE_LENGTH}
                  onPress={() => void joinJam(codeInput).catch(() => {})}
                />
              </View>
            </>
          )}

          {notice ? <Text style={[type.caption, { color: colors.accent }]}>{notice}</Text> : null}
          {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.page, gap: spacing.md, paddingBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  code: { fontSize: 40, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
  section: { marginTop: spacing.sm },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  input: { height: 48, borderRadius: radius.md, paddingHorizontal: spacing.md },
  codeInput: { letterSpacing: 4, fontWeight: '700' },
  joinRow: { flexDirection: 'row', gap: spacing.sm },
  or: { textAlign: 'center', marginTop: spacing.sm },
  button: {
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
