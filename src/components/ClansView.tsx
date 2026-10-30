import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { showSheet } from './Sheet';
import { TextPrompt } from './TextPrompt';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme, withAlpha } from './theme';
import { CLAN_EMOJIS, createClan, joinClan, refreshClans, useClans } from '@/lib/clans';
import type { ClanSummary } from '@/store/clansStore';

/** Avatars orbiting the clan shield (empty state). */
function Orbit({
  letter,
  angle,
  color,
  bg,
}: {
  letter: string;
  angle: number;
  color: string;
  bg: string;
}) {
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 14_000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    a.start();
    return () => a.stop();
  }, [spin]);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: [`${angle}deg`, `${angle + 360}deg`],
  });
  const counter = spin.interpolate({
    inputRange: [0, 1],
    outputRange: [`${-angle}deg`, `${-angle - 360}deg`],
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.orbitArm, { transform: [{ rotate }] }]}>
      <Animated.View
        style={[styles.orbitDot, { backgroundColor: bg, transform: [{ rotate: counter }] }]}
      >
        <Text style={[type.bodyStrong, { color }]}>{letter}</Text>
      </Animated.View>
    </Animated.View>
  );
}

function preview(c: ClanSummary): string {
  const last = c.last;
  if (!last) return `${c.members} member${c.members === 1 ? '' : 's'}`;
  const who = last.name ?? 'Someone';
  if (last.kind === 'jam') return `🎧 ${who} shared a Jam`;
  if (last.kind === 'system') {
    if (last.body === 'joined') return `${who} joined`;
    if (last.body === 'left') return `${who} left`;
    return `${who} was removed`;
  }
  return `${who}: ${last.body}`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Name + emoji form for a new clan. */
function CreateClanModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(CLAN_EMOJIS[0] ?? '🎧');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await createClan(name.trim(), emoji);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.card, { backgroundColor: colors.surfaceHigh }]}>
          <Text style={[type.title, styles.center, { color: colors.text }]}>New clan</Text>
          <View style={[styles.bigEmoji, { backgroundColor: colors.accentSoft }]}>
            <Text style={styles.bigEmojiText}>{emoji}</Text>
          </View>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Clan name"
            placeholderTextColor={colors.placeholder}
            maxLength={30}
            autoFocus
            style={[
              styles.input,
              type.body,
              { backgroundColor: colors.surface, color: colors.text },
            ]}
          />
          <View style={styles.emojiGrid}>
            {CLAN_EMOJIS.map((e) => (
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
          {error ? (
            <Text style={[type.caption, styles.center, { color: colors.danger }]}>{error}</Text>
          ) : null}
          <View style={styles.cardButtons}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={styles.cardBtn}
              hitSlop={6}
            >
              <Text style={[type.bodyStrong, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void create()}
              disabled={busy || name.trim().length < 2}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.cardBtn,
                styles.primary,
                {
                  backgroundColor: colors.accent,
                  opacity: busy || name.trim().length < 2 ? 0.4 : pressed ? 0.8 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Create</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Clan list + create / join. Lives in the Crew tab (no own header or safe area). */
export function ClansView() {
  const { colors } = useTheme();
  const router = useRouter();
  const clans = useClans();
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (spinner: boolean) => {
    if (spinner) setRefreshing(true);
    try {
      await refreshClans();
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      if (spinner) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const join = async (code: string) => {
    setJoining(false);
    setBusy(true);
    try {
      const { id } = await joinClan(code);
      router.push(`/clan/${id}`);
    } catch (err) {
      showSheet("Couldn't join", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <View style={styles.actions}>
          <Pressable
            onPress={() => setCreating(true)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="add-circle" size={20} color={colors.onAccent} />
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Create clan</Text>
          </Pressable>
          <Pressable
            onPress={() => setJoining(true)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.surfaceHigh, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="key" size={18} color={colors.text} />
            <Text style={[type.bodyStrong, { color: colors.text }]}>Join with code</Text>
          </Pressable>
        </View>

        {busy ? <ActivityIndicator style={styles.spinner} color={colors.accent} /> : null}
        {loadError ? (
          <Text style={[type.caption, styles.error, { color: colors.danger }]}>{loadError}</Text>
        ) : null}

        {clans.length > 0 ? (
          <View style={styles.list}>
            {clans.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/clan/${c.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}${c.unread ? `, ${c.unread} unread` : ''}`}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.surface },
                ]}
              >
                <View style={[styles.rowEmoji, { backgroundColor: colors.accentSoft }]}>
                  <Text style={styles.emojiText}>{c.emoji}</Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.rowTop}>
                    <Text
                      style={[type.bodyStrong, styles.flex, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <Text
                      style={[type.caption, { color: c.unread ? colors.accent : colors.textFaint }]}
                    >
                      {timeLabel(c.last_at)}
                    </Text>
                  </View>
                  <View style={styles.rowTop}>
                    <Text
                      style={[
                        type.caption,
                        styles.flex,
                        {
                          color: c.unread ? colors.text : colors.textMuted,
                          fontWeight: c.unread ? '700' : '500',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {preview(c)}
                    </Text>
                    {c.unread ? (
                      <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                        <Text style={[styles.badgeText, { color: colors.onAccent }]}>
                          {c.unread > 50 ? '50+' : c.unread}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <View style={styles.hero}>
              <View style={[styles.glow, { backgroundColor: withAlpha(colors.accent, 0.12) }]} />
              <Orbit letter="R" angle={0} color={colors.accent} bg={colors.accentSoft} />
              <Orbit letter="A" angle={120} color={colors.accent} bg={colors.accentSoft} />
              <Orbit letter="K" angle={240} color={colors.accent} bg={colors.accentSoft} />
              <View style={[styles.shield, { backgroundColor: colors.accent }]}>
                <Ionicons name="shield" size={44} color={colors.onAccent} />
              </View>
            </View>
            <Text style={[type.title, styles.center, { color: colors.text }]}>
              Your crew, your music
            </Text>
            <Text style={[type.body, styles.center, { color: colors.textMuted }]}>
              Make a clan for your friends: chat, drop a Jam, and everyone joins in one tap.
              Invite-only, up to 30 members.
            </Text>
          </View>
        )}
      </ScrollView>

      <CreateClanModal
        // Fresh form every time it opens.
        key={creating ? 'open' : 'closed'}
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          router.push(`/clan/${id}`);
        }}
      />
      <TextPrompt
        visible={joining}
        title="Clan code"
        confirmLabel="Join"
        onCancel={() => setJoining(false)}
        onConfirm={(v) => void join(v)}
      />
    </View>
  );
}

const ORBIT = 92;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  scroll: { paddingBottom: CONTENT_BOTTOM_PADDING },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.page,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.md,
  },
  spinner: { marginTop: spacing.lg },
  error: { marginHorizontal: spacing.page, marginTop: spacing.md },
  list: { marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.page,
  },
  rowEmoji: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: '800' },
  empty: { paddingHorizontal: spacing.page, gap: spacing.sm },
  hero: { height: 230, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },
  shield: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitArm: { position: 'absolute', width: ORBIT * 2, height: ORBIT * 2, alignItems: 'center' },
  orbitDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: spacing.page,
  },
  card: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  bigEmoji: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigEmojiText: { fontSize: 38 },
  input: { height: 48, borderRadius: radius.md, paddingHorizontal: spacing.md },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  emojiCell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 24 },
  cardButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cardBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {},
});
