import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { radius, spacing, type, useTheme, withAlpha } from '@/components/theme';
import { joinJam, startJam } from '@/jam/session';
import {
  CLAN_MAX_MEMBERS,
  CLAN_MESSAGE_MAX,
  clanInviteMessage,
  deleteClan,
  kickFromClan,
  leaveClan,
  loadClan,
  resetClanCode,
  sendClanMessage,
  setActiveClan,
  shareJamToClan,
} from '@/lib/clans';
import type { ClanMember, ClanMessage } from '@/store/clansStore';
import { useClansStore } from '@/store/clansStore';
import { useJamStore } from '@/store/jamStore';
import { useProfileStore } from '@/store/profileStore';

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function systemText(m: ClanMessage): string {
  if (m.body === 'joined') return `${m.name} joined the clan`;
  if (m.body === 'left') return `${m.name} left`;
  return `${m.name} was removed`;
}

function Message({
  m,
  mine,
  onJoinJam,
}: {
  m: ClanMessage;
  mine: boolean;
  onJoinJam: (code: string) => void;
}) {
  const { colors } = useTheme();
  const myJam = useJamStore((s) => (s.status !== 'idle' ? s.code : null));

  if (m.kind === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text
          style={[
            type.caption,
            styles.systemText,
            { color: colors.textFaint, backgroundColor: colors.surface },
          ]}
        >
          {systemText(m)}
        </Text>
      </View>
    );
  }

  if (m.kind === 'jam' && m.jam) {
    const inIt = myJam === m.jam;
    // Ended unless you're in it right now (then it's clearly still going).
    const ended = !!m.ended && !inIt;
    return (
      <View style={[styles.msgRow, mine && styles.mine]}>
        <View
          style={[
            styles.jamCard,
            ended
              ? { borderColor: colors.border, backgroundColor: colors.surface }
              : { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.08) },
          ]}
        >
          <View
            style={[
              styles.jamIcon,
              { backgroundColor: ended ? colors.surfaceHigh : colors.accent },
            ]}
          >
            <Ionicons
              name={ended ? 'radio-outline' : 'radio'}
              size={20}
              color={ended ? colors.textFaint : colors.onAccent}
            />
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, { color: ended ? colors.textMuted : colors.text }]}>
              {mine ? 'You' : m.name} started a Jam
            </Text>
            <Text style={[type.caption, { color: colors.textMuted }]}>
              {ended ? 'Ended' : `Code ${m.jam}`} · {time(m.at)}
            </Text>
          </View>
          {ended ? (
            <Text style={[type.caption, { color: colors.textFaint, fontWeight: '700' }]}>
              Ended
            </Text>
          ) : inIt ? (
            <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>Joined</Text>
          ) : (
            <Pressable
              onPress={() => onJoinJam(m.jam ?? '')}
              accessibilityRole="button"
              accessibilityLabel={`Join ${m.name}'s Jam`}
              style={({ pressed }) => [
                styles.joinPill,
                { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>
                Join
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.msgRow, mine && styles.mine]}>
      <View style={[styles.bubble, { backgroundColor: mine ? colors.accent : colors.surfaceHigh }]}>
        {!mine ? (
          <Text style={[type.micro, { color: colors.accent }]}>{m.name.toUpperCase()}</Text>
        ) : null}
        <Text selectable style={[type.body, { color: mine ? colors.onAccent : colors.text }]}>
          {m.body}
        </Text>
        <Text
          style={[
            styles.time,
            { color: mine ? withAlpha(colors.onAccent, 0.7) : colors.textFaint },
          ]}
        >
          {time(m.at)}
        </Text>
      </View>
    </View>
  );
}

/** One clan: chat, Jam cards, members. */
export default function ClanChatScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const clanId = String(id ?? '');
  const detail = useClansStore((s) => s.details[clanId]);
  const summary = useClansStore((s) => s.clans.find((c) => c.id === clanId));
  const me = useProfileStore((s) => s.profile?.id);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBack = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/clans')),
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      setActiveClan(clanId);
      loadClan(clanId)
        .then(() => setError(null))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          if (/anymore|not a member/i.test(message)) {
            showSheet(
              'Clan unavailable',
              "You're no longer in this clan (it was deleted or you were removed).",
            );
            goBack();
          } else {
            setError(message);
          }
        });
      return () => setActiveClan(null);
    }, [clanId, goBack]),
  );

  const messages = useMemo(() => [...(detail?.messages ?? [])].reverse(), [detail?.messages]);
  const name = detail?.name ?? summary?.name ?? 'Clan';
  const emoji = detail?.emoji ?? summary?.emoji ?? '🎧';
  const code = detail?.code ?? summary?.code ?? '';
  const isOwner = detail?.owner ?? summary?.owner ?? false;
  const memberCount = detail?.members.length ?? summary?.members ?? 0;

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (err) {
      showSheet("Couldn't do that", err instanceof Error ? err.message : String(err));
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendClanMessage(clanId, body);
      setText('');
    } catch (err) {
      showSheet("Couldn't send", err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const invite = () => {
    if (code) void Share.share({ message: clanInviteMessage(name, code) });
  };

  const joinFromCard = (jamCode: string) => {
    void joinJam(jamCode).catch(() => {});
    router.push('/jam');
  };

  /** Share the current Jam, or start one and share it. */
  const shareJam = () => {
    const jam = useJamStore.getState();
    if (jam.status === 'active' && jam.code) {
      const jamCode = jam.code;
      showSheet('Share your Jam here?', `Clan members can join code ${jamCode} in one tap.`, [
        {
          text: 'Share Jam',
          icon: 'radio',
          onPress: () => void run(() => shareJamToClan(clanId, jamCode)),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    showSheet(
      'Start a Jam for the clan?',
      'Starts a Jam with your current music and drops it in the chat.',
      [
        {
          text: 'Start & share',
          icon: 'radio',
          onPress: () =>
            void run(async () => {
              const jamCode = await startJam(false);
              await shareJamToClan(clanId, jamCode);
            }),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const menu = () =>
    showSheet(`${emoji} ${name}`, `${memberCount}/${CLAN_MAX_MEMBERS} members · Code ${code}`, [
      { text: 'Invite friends', icon: 'share-social-outline', onPress: invite },
      { text: 'Members', icon: 'people-outline', onPress: () => setMembersOpen(true) },
      ...(isOwner
        ? [
            {
              text: 'New invite code',
              icon: 'refresh-outline' as const,
              onPress: () =>
                void run(async () => {
                  const next = await resetClanCode(clanId);
                  showSheet('New invite code', `${next}\nOld links and codes no longer work.`);
                }),
            },
            {
              text: 'Delete clan',
              icon: 'trash-outline' as const,
              style: 'destructive' as const,
              onPress: () =>
                showSheet(
                  'Delete this clan?',
                  'Chat and members are removed for everyone. This can’t be undone.',
                  [
                    {
                      text: 'Delete',
                      icon: 'trash-outline',
                      style: 'destructive',
                      onPress: () =>
                        void run(async () => {
                          await deleteClan(clanId);
                          goBack();
                        }),
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ],
                ),
            },
          ]
        : []),
      {
        text: 'Leave clan',
        icon: 'exit-outline',
        style: 'destructive',
        onPress: () =>
          showSheet(
            'Leave this clan?',
            isOwner
              ? 'The longest-standing member becomes the new owner.'
              : 'You can rejoin with the code later.',
            [
              {
                text: 'Leave',
                icon: 'exit-outline',
                style: 'destructive',
                onPress: () =>
                  void run(async () => {
                    await leaveClan(clanId);
                    goBack();
                  }),
              },
              { text: 'Cancel', style: 'cancel' },
            ],
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const kick = (m: ClanMember) =>
    showSheet(`Remove ${m.name}?`, 'They leave the clan and can’t rejoin with the code.', [
      {
        text: 'Remove',
        icon: 'person-remove-outline',
        style: 'destructive',
        onPress: () => void run(() => kickFromClan(clanId, m.id)),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <IconButton icon="arrow-back" label="Back" onPress={goBack} />
          <Pressable
            onPress={() => setMembersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Members"
            style={styles.headerTitle}
          >
            <View style={[styles.headerEmoji, { backgroundColor: colors.accentSoft }]}>
              <Text style={styles.headerEmojiText}>{emoji}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                {memberCount} member{memberCount === 1 ? '' : 's'}
              </Text>
            </View>
          </Pressable>
          <IconButton icon="person-add-outline" label="Invite friends" onPress={invite} />
          <IconButton icon="ellipsis-vertical" label="Clan options" onPress={menu} />
        </View>

        {error ? (
          <Text style={[type.caption, styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}

        {!detail ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.loading}>
            <Text style={styles.bigEmoji}>{emoji}</Text>
            <Text style={[type.heading, { color: colors.text }]}>Say hi to your clan</Text>
            <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
              Invite friends with code {code}, or drop a Jam with the 🎧 button.
            </Text>
            <Pressable
              onPress={invite}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.inviteBtn,
                { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="share-social" size={18} color={colors.onAccent} />
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Invite friends</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            inverted
            data={messages}
            keyExtractor={(m) => String(m.id)}
            renderItem={({ item }) => (
              <Message m={item} mine={!!me && item.user_id === me} onJoinJam={joinFromCard} />
            )}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View
          style={[
            styles.inputBar,
            { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}
        >
          <IconButton
            icon="radio-outline"
            label="Share a Jam"
            onPress={shareJam}
            color={colors.accent}
          />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.placeholder}
            maxLength={CLAN_MESSAGE_MAX}
            multiline
            style={[
              styles.input,
              type.body,
              { backgroundColor: colors.surfaceHigh, color: colors.text },
            ]}
          />
          <Pressable
            onPress={() => void send()}
            disabled={!text.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: colors.accent,
                opacity: !text.trim() || sending ? 0.4 : pressed ? 0.8 : 1,
              },
            ]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <Ionicons name="send" size={18} color={colors.onAccent} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={membersOpen}
        animationType="slide"
        onRequestClose={() => setMembersOpen(false)}
      >
        <View
          style={[
            styles.membersSheet,
            { backgroundColor: colors.background, paddingTop: insets.top },
          ]}
        >
          <View style={styles.membersHead}>
            <IconButton icon="close" label="Close" onPress={() => setMembersOpen(false)} />
            <Text style={[type.title, styles.flex, { color: colors.text }]}>
              Members · {memberCount}/{CLAN_MAX_MEMBERS}
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
            <View style={[styles.codeCard, { backgroundColor: colors.surface }]}>
              <Text style={[type.micro, { color: colors.textMuted }]}>INVITE CODE</Text>
              <Text selectable style={[styles.code, { color: colors.text }]}>
                {code}
              </Text>
              <Pressable
                onPress={invite}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.inviteBtn,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Ionicons name="share-social" size={18} color={colors.onAccent} />
                <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Share invite</Text>
              </Pressable>
            </View>
            {(detail?.members ?? []).map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[type.bodyStrong, { color: colors.accent }]}>
                    {(m.name[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
                <Text style={[type.body, styles.flex, { color: colors.text }]} numberOfLines={1}>
                  {m.name}
                  {m.id === me ? ' (you)' : ''}
                </Text>
                {m.owner ? (
                  <Text style={[type.micro, { color: colors.accent }]}>OWNER</Text>
                ) : isOwner ? (
                  <IconButton
                    icon="person-remove-outline"
                    size={20}
                    label={`Remove ${m.name}`}
                    onPress={() => kick(m)}
                  />
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerEmoji: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmojiText: { fontSize: 22 },
  error: { paddingHorizontal: spacing.page, paddingTop: spacing.sm },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.page,
  },
  bigEmoji: { fontSize: 56 },
  messages: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  msgRow: { flexDirection: 'row' },
  mine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    gap: 2,
  },
  time: { fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
  systemRow: { alignItems: 'center' },
  systemText: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  jamCard: {
    width: '85%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  jamIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinPill: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: 11,
    paddingBottom: 11,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  membersSheet: { flex: 1 },
  membersHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  codeCard: {
    marginHorizontal: spacing.page,
    marginVertical: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.page,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
