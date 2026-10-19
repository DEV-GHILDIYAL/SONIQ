import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { TextPrompt } from '@/components/TextPrompt';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme } from '@/components/theme';
import { joinJam } from '@/jam/session';
import {
  inviteMessage,
  refreshFriends,
  removeFriend,
  respondToRequest,
  sendFriendRequest,
  setBlocked,
  useFriendLists,
} from '@/lib/friends';
import type { FriendEntry } from '@/store/friendsStore';
import { useProfileStore } from '@/store/profileStore';

function Avatar({ name }: { name: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
      <Text style={[type.bodyStrong, { color: colors.accent }]}>
        {(name[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

function Row({
  entry,
  children,
  live,
}: {
  entry: FriendEntry;
  children?: ReactNode;
  live?: boolean;
}) {
  const { colors } = useTheme();
  const jam = live ? entry.jam : null;
  return (
    <View style={styles.row}>
      <Avatar name={entry.name} />
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {entry.name}
        </Text>
        {jam ? (
          <Text style={[type.caption, { color: colors.accent }]} numberOfLines={1}>
            🟢 In a Jam{jam.title ? ` · ${jam.title}` : ''} · {jam.members} listening
          </Text>
        ) : (
          <Text style={[type.caption, { color: colors.textMuted }]}>{entry.id}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  if (count === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[type.micro, styles.sectionTitle, { color: colors.textMuted }]}>
        {title} · {count}
      </Text>
      {children}
    </View>
  );
}

export default function FriendsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const { friends, incoming, outgoing, blocked } = useFriendLists();
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (spinner: boolean) => {
    if (spinner) setRefreshing(true);
    try {
      await refreshFriends();
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

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
    } catch (err) {
      showSheet("Couldn't do that", err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const addById = async (raw: string) => {
    setAdding(false);
    await run('add', async () => {
      const result = await sendFriendRequest(raw);
      showSheet(
        result === 'friends' ? "You're now friends 🎉" : 'Request sent',
        result === 'friends' ? undefined : "They'll see it in their Friends page.",
      );
    });
  };

  const friendMenu = (f: FriendEntry) =>
    showSheet(f.name, f.id, [
      {
        text: 'Remove friend',
        icon: 'person-remove-outline',
        onPress: () => void run(f.id, () => removeFriend(f.id)),
      },
      {
        text: 'Block',
        icon: 'ban-outline',
        style: 'destructive',
        onPress: () => void run(f.id, () => setBlocked(f.id, true)),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const busy = (id: string) => busyId === id;
  const nothing = friends.length + incoming.length + outgoing.length === 0;

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={[type.title, styles.flex, { color: colors.text }]}>Friends</Text>
        <IconButton
          icon="person-add-outline"
          label="Add a friend by ID"
          onPress={() => setAdding(true)}
        />
      </View>

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
        <View style={[styles.invite, { backgroundColor: colors.surface }]}>
          <Text style={[type.heading, { color: colors.text }]}>Invite friends</Text>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            Send your link. When they tap it, SONIQ opens and asks to add you.
          </Text>
          <View style={styles.inviteButtons}>
            <Pressable
              disabled={!profile}
              onPress={() =>
                profile && void Share.share({ message: inviteMessage(profile.id, profile.name) })
              }
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.pillBtn,
                { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="share-social" size={18} color={colors.onAccent} />
              <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>
                Share invite
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.pillBtn,
                { backgroundColor: colors.surfaceHigh, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="person-add" size={18} color={colors.text} />
              <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                Add by ID
              </Text>
            </Pressable>
          </View>
          {profile ? (
            <Text selectable style={[type.caption, { color: colors.textFaint }]}>
              Your ID: {profile.id}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => router.push('/clans')}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.clans,
            { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="shield" size={20} color={colors.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>Clans</Text>
            <Text style={[type.caption, { color: colors.textMuted }]}>
              Group chat + Jams with your crew · Coming soon
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>

        {busyId === 'add' ? (
          <ActivityIndicator style={styles.spinner} color={colors.accent} />
        ) : null}
        {loadError ? (
          <Text style={[type.caption, styles.error, { color: colors.danger }]}>{loadError}</Text>
        ) : null}

        <Section title="REQUESTS" count={incoming.length}>
          {incoming.map((r) => (
            <Row key={r.id} entry={r}>
              {busy(r.id) ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <Pressable
                    onPress={() => void run(r.id, () => respondToRequest(r.id, true))}
                    accessibilityRole="button"
                    accessibilityLabel={`Accept ${r.name}`}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>
                      Accept
                    </Text>
                  </Pressable>
                  <IconButton
                    icon="close"
                    size={20}
                    label={`Decline ${r.name}`}
                    onPress={() => void run(r.id, () => respondToRequest(r.id, false))}
                  />
                </>
              )}
            </Row>
          ))}
        </Section>

        <Section title="FRIENDS" count={friends.length}>
          {[...friends]
            .sort((a, b) => Number(!!b.jam) - Number(!!a.jam))
            .map((f) => (
              <Row key={f.id} entry={f} live>
                {f.jam ? (
                  <Pressable
                    onPress={() => {
                      if (f.jam) void joinJam(f.jam.code).catch(() => {});
                      router.push('/jam');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Join ${f.name}'s Jam`}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>
                      Join
                    </Text>
                  </Pressable>
                ) : null}
                {busy(f.id) ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <IconButton
                    icon="ellipsis-vertical"
                    size={20}
                    label={`Options for ${f.name}`}
                    onPress={() => friendMenu(f)}
                  />
                )}
              </Row>
            ))}
        </Section>

        <Section title="SENT" count={outgoing.length}>
          {outgoing.map((r) => (
            <Row key={r.id} entry={r}>
              {busy(r.id) ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Pressable
                  onPress={() => void run(r.id, () => removeFriend(r.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel request to ${r.name}`}
                  hitSlop={8}
                >
                  <Text style={[type.caption, { color: colors.textMuted, fontWeight: '700' }]}>
                    Cancel
                  </Text>
                </Pressable>
              )}
            </Row>
          ))}
        </Section>

        <Section title="BLOCKED" count={blocked.length}>
          {blocked.map((b) => (
            <Row key={b.id} entry={b}>
              {busy(b.id) ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Pressable
                  onPress={() => void run(b.id, () => setBlocked(b.id, false))}
                  accessibilityRole="button"
                  accessibilityLabel={`Unblock ${b.name}`}
                  hitSlop={8}
                >
                  <Text style={[type.caption, { color: colors.textMuted, fontWeight: '700' }]}>
                    Unblock
                  </Text>
                </Pressable>
              )}
            </Row>
          ))}
        </Section>

        {nothing && !loadError ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={44} color={colors.textFaint} />
            <Text style={[type.heading, { color: colors.text }]}>No friends yet</Text>
            <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
              Share your invite link or add someone with their SONIQ ID.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <TextPrompt
        visible={adding}
        title="Friend's SONIQ ID"
        initialValue="SQ-"
        confirmLabel="Send request"
        onCancel={() => setAdding(false)}
        onConfirm={(v) => void addById(v)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.page - 10,
    paddingVertical: spacing.xs,
  },
  scroll: { paddingBottom: CONTENT_BOTTOM_PADDING },
  invite: {
    marginHorizontal: spacing.page,
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  inviteButtons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  spinner: { marginTop: spacing.lg },
  clans: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.page,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  error: { marginHorizontal: spacing.page, marginTop: spacing.md },
  section: { marginTop: spacing.xl },
  sectionTitle: { paddingHorizontal: spacing.page, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.page,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtn: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.page,
  },
});
