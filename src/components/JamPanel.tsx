import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { joinJam, kickMember, leaveJam, setGuestMode, setJamPublic, startJam } from '@/jam/session';
import { CODE_LENGTH, normalizeCode } from '@/jam/sync';
import { shareJamToClan, useClans } from '@/lib/clans';
import { jamLink, useFriendLists } from '@/lib/friends';
import { successHaptic } from '@/lib/haptics';
import { realtimeConfigured, type RoomMember } from '@/lib/realtime';
import { useJamStore, type GuestMode } from '@/store/jamStore';
import { useProfileStore } from '@/store/profileStore';
import { IconButton } from './IconButton';
import { showSheet } from './Sheet';
import { radius, spacing, type, useTheme } from './theme';

/** Public / Private picker (before starting, and for the host during the Jam). */
function VisibilityPicker({
  isPublic,
  onChange,
}: {
  isPublic: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  const option = (value: boolean, icon: keyof typeof Ionicons.glyphMap, label: string) => {
    const on = isPublic === value;
    return (
      <Pressable
        onPress={() => onChange(value)}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        style={[
          styles.visOption,
          {
            backgroundColor: on ? colors.accentSoft : colors.surfaceHigh,
            borderColor: on ? colors.accent : 'transparent',
          },
        ]}
      >
        <Ionicons name={icon} size={18} color={on ? colors.accent : colors.textMuted} />
        <Text style={[type.bodyStrong, { color: on ? colors.text : colors.textMuted }]}>
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.vis}>
      <View style={styles.visRow}>
        {option(false, 'lock-closed', 'Private')}
        {option(true, 'globe-outline', 'Public')}
      </View>
      <Text style={[type.caption, { color: colors.textMuted }]}>
        {isPublic
          ? 'Your friends see this Jam and can join in one tap. Anyone with the link can join.'
          : 'Hidden from everyone, even friends. People join only with the code.'}
      </Text>
    </View>
  );
}

const GUEST_MODES: {
  mode: GuestMode;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  text: string;
}[] = [
  {
    mode: 'listen',
    icon: 'headset-outline',
    label: 'Listen',
    text: 'Guests just listen. Only you pick songs.',
  },
  {
    mode: 'add',
    icon: 'add-circle-outline',
    label: 'Add songs',
    text: 'Guests can add songs to the queue.',
  },
  {
    mode: 'control',
    icon: 'options-outline',
    label: 'Full control',
    text: 'Guests can add songs, play/pause, skip and change the song.',
  },
];

/** Host: what guests may do. */
function GuestModePicker({
  mode,
  onChange,
}: {
  mode: GuestMode;
  onChange: (m: GuestMode) => void;
}) {
  const { colors } = useTheme();
  const current = GUEST_MODES.find((g) => g.mode === mode) ?? GUEST_MODES[1];
  return (
    <View style={styles.vis}>
      <Text style={[type.micro, { color: colors.textMuted }]}>GUESTS CAN</Text>
      <View style={styles.visRow}>
        {GUEST_MODES.map((g) => {
          const on = g.mode === mode;
          return (
            <Pressable
              key={g.mode}
              onPress={() => onChange(g.mode)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[
                styles.modeOption,
                {
                  backgroundColor: on ? colors.accentSoft : colors.surfaceHigh,
                  borderColor: on ? colors.accent : 'transparent',
                },
              ]}
            >
              <Ionicons name={g.icon} size={18} color={on ? colors.accent : colors.textMuted} />
              <Text
                style={[
                  type.caption,
                  { color: on ? colors.text : colors.textMuted, fontWeight: '700' },
                ]}
              >
                {g.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.caption, { color: colors.textMuted }]}>{current?.text}</Text>
    </View>
  );
}

/** Friends who are in a public Jam right now. */
function FriendsInJam() {
  const { colors } = useTheme();
  const router = useRouter();
  const { friends } = useFriendLists();
  const live = friends.filter((f) => f.jam);
  if (live.length === 0) return null;
  return (
    <View style={styles.liveBox}>
      <Text style={[type.micro, { color: colors.textMuted }]}>FRIENDS IN A JAM</Text>
      {live.map((f) => (
        <View key={f.id} style={styles.member}>
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
            <Text style={[type.bodyStrong, { color: colors.accent }]}>
              {(f.name[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
              {f.name}
            </Text>
            <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
              🟢 {f.jam?.title ? `${f.jam.title} · ${f.jam.artist ?? ''}` : 'In a Jam'} ·{' '}
              {f.jam?.members ?? 1} listening
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (f.jam) void joinJam(f.jam.code).catch(() => {});
              router.push('/jam');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Join ${f.name}'s Jam`}
            style={({ pressed }) => [
              styles.joinPill,
              { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>Join</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

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
  const bg =
    kind === 'primary' ? colors.accent : kind === 'danger' ? 'transparent' : colors.surfaceHigh;
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

const setJamNotice = (notice: string) => useJamStore.setState({ notice });

/** Start / join / manage a Jam (listen together). Rendered by the Jam tab. */
export function JamPanel() {
  const { colors } = useTheme();
  const router = useRouter();
  const status = useJamStore((s) => s.status);
  // A little buzz the moment a Jam connects (start or join).
  const lastStatus = useRef(status);
  useEffect(() => {
    if (lastStatus.current === 'connecting' && status === 'active') successHaptic();
    lastStatus.current = status;
  }, [status]);
  const role = useJamStore((s) => s.role);
  const code = useJamStore((s) => s.code);
  const members = useJamStore((s) => s.members);
  const upNext = useJamStore((s) => s.upNext);
  const notice = useJamStore((s) => s.notice);
  const error = useJamStore((s) => s.error);
  const myName = useProfileStore((s) => s.profile?.name ?? '');
  const isPublic = useJamStore((s) => s.isPublic);
  const guestMode = useJamStore((s) => s.guestMode);
  const upNextBy = useJamStore((s) => s.upNextBy);
  const reconnecting = useJamStore((s) => s.reconnecting);
  const hostOffline = useJamStore((s) => s.hostOffline);
  const [codeInput, setCodeInput] = useState('');
  const [startPublic, setStartPublic] = useState(false);

  const inputStyle = [
    styles.input,
    type.body,
    { backgroundColor: colors.surfaceHigh, color: colors.text },
  ];
  const configured = realtimeConfigured();

  const share = () => {
    if (!code) return;
    void Share.share({
      message: `Join my SONIQ Jam 🎧\n${jamLink(code)}\n\nOr open SONIQ → Jam and enter code: ${code}`,
    });
  };

  const clans = useClans();
  const shareToClan = () => {
    if (!code) return;
    if (clans.length === 0) {
      showSheet('No clans yet', 'Create or join a clan to share Jams with your crew.', [
        { text: 'Open Clans', icon: 'shield-outline', onPress: () => router.push('/clans') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    showSheet('Share Jam to a clan', `Members can join code ${code} in one tap.`, [
      ...clans.slice(0, 6).map((c) => ({
        text: `${c.emoji} ${c.name}`,
        onPress: () =>
          void shareJamToClan(c.id, code)
            .then(() => setJamNotice(`Shared to ${c.name}`))
            .catch((err: unknown) =>
              showSheet("Couldn't share", err instanceof Error ? err.message : String(err)),
            ),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const removeMember = (m: RoomMember) =>
    showSheet(`Remove ${m.name}?`, 'They leave the Jam and can’t rejoin this one.', [
      {
        text: 'Remove',
        icon: 'person-remove-outline',
        style: 'destructive',
        onPress: () => kickMember(m),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

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
          <Pressable
            onPress={share}
            accessibilityRole="button"
            accessibilityLabel={`Share code ${code}`}
          >
            <Text style={[styles.code, { color: colors.text }]}>{code}</Text>
          </Pressable>
          {reconnecting || (role === 'guest' && hostOffline) ? (
            <View style={[styles.banner, { backgroundColor: colors.surfaceHigh }]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[type.caption, styles.flex, { color: colors.text }]}>
                {reconnecting
                  ? 'Reconnecting… you stay in the Jam.'
                  : 'Host is offline. Waiting for them to come back…'}
              </Text>
            </View>
          ) : null}
          <Text style={[type.caption, { color: colors.textMuted }]}>
            {role === 'host'
              ? 'You control playback.'
              : guestMode === 'control'
                ? 'You can add songs, play/pause, skip and change the song for everyone.'
                : guestMode === 'add'
                  ? 'The host controls playback. Tap a song or ⋮ → Add to queue to add it.'
                  : 'The host picks the songs. Sit back and listen 🎧'}
          </Text>
          {role === 'host' ? (
            <>
              <Button label="Share invite link" kind="secondary" onPress={share} />
              <Button label="Share to clan" kind="secondary" onPress={shareToClan} />
              <VisibilityPicker isPublic={isPublic} onChange={setJamPublic} />
              <GuestModePicker mode={guestMode} onChange={setGuestMode} />
            </>
          ) : (
            <>
              <Button label="Share to clan" kind="secondary" onPress={shareToClan} />
              <View style={styles.badgeRow}>
                <Ionicons
                  name={isPublic ? 'globe-outline' : 'lock-closed'}
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={[type.caption, { color: colors.textMuted }]}>
                  {isPublic ? 'Public Jam' : 'Private Jam'}
                </Text>
              </View>
            </>
          )}

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
              ) : role === 'host' ? (
                <IconButton
                  icon="close"
                  size={18}
                  label={`Remove ${m.name}`}
                  onPress={() => removeMember(m)}
                />
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
                  {upNextBy[t.id] ? (
                    <Text style={{ color: colors.accent }}> · added by {upNextBy[t.id]}</Text>
                  ) : null}
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
            Friends will see you as{' '}
            <Text style={{ color: colors.text }}>{myName || 'Listener'}</Text> (change it in
            Profile).
          </Text>
          <VisibilityPicker isPublic={startPublic} onChange={setStartPublic} />
          <Button label="Start a Jam" onPress={() => void startJam(startPublic).catch(() => {})} />
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
          <FriendsInJam />
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { height: 48, borderRadius: radius.md, paddingHorizontal: spacing.md },
  codeInput: { letterSpacing: 4, fontWeight: '700' },
  joinRow: { flexDirection: 'row', gap: spacing.sm },
  or: { textAlign: 'center', marginTop: spacing.sm },
  vis: { gap: spacing.sm },
  visRow: { flexDirection: 'row', gap: spacing.sm },
  visOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  modeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  liveBox: { gap: spacing.md, marginTop: spacing.lg },
  joinPill: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  button: {
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
