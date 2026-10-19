/**
 * Friends: requests, accept/decline, remove, block (Supabase functions soniq_friend_*).
 * Lists are cached in friendsStore; call refreshFriends() after any change.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { EMPTY_FRIENDS, useFriendsStore, type FriendLists } from '@/store/friendsStore';
import { useProfileStore } from '@/store/profileStore';
import { normalizeId } from './cloudBackup';
import { env } from './env';
import { flushListening } from './listeningSync';
import { getSupabase, supabaseConfigured } from './supabase';

export const friendsAvailable = (): boolean => supabaseConfigured();

function readable(message: string): string {
  if (/no such user/i.test(message)) return 'No SONIQ user with that ID. Check it and try again.';
  if (/that is you/i.test(message)) return "That's your own ID 🙂";
  if (/you blocked them/i.test(message))
    return 'You blocked this person. Unblock them first (Friends → Blocked).';
  if (/friend limit/i.test(message)) return 'You can have up to 200 friends.';
  if (/rate limited/i.test(message))
    return 'Too many pending requests. Wait for some to be accepted.';
  if (/request not found/i.test(message)) return 'That request was cancelled.';
  if (/network|fetch|timeout/i.test(message)) return 'No internet. Try again.';
  return message;
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const profile = useProfileStore.getState().profile;
  if (!profile || !friendsAvailable()) throw new Error('Friends are not available in this build.');
  // Make sure our profile exists on the server first.
  await flushListening();
  const { data, error } = await getSupabase().rpc(fn, {
    p_id: profile.id,
    p_secret: profile.secret,
    ...args,
  });
  if (error) throw new Error(readable(error.message));
  return data as T;
}

let refreshing: Promise<void> | null = null;

/** Reload all lists from the server. Concurrent calls share one request. */
export function refreshFriends(): Promise<void> {
  if (refreshing) return refreshing;
  const run = (async () => {
    const profile = useProfileStore.getState().profile;
    if (!profile) return;
    const lists = await call<FriendLists>('soniq_friends_list');
    useFriendsStore.getState().setLists(profile.id, { ...EMPTY_FRIENDS, ...lists });
  })();
  refreshing = run;
  // Clear only after it settles (an early return used to leave a stale promise forever).
  run.then(
    () => {
      if (refreshing === run) refreshing = null;
    },
    () => {
      if (refreshing === run) refreshing = null;
    },
  );
  return run;
}

/** Lists for the current profile (empty if the cache belongs to another account). */
export function useFriendLists(): FriendLists {
  const ownerId = useFriendsStore((s) => s.ownerId);
  const me = useProfileStore((s) => s.profile?.id ?? null);
  const friends = useFriendsStore((s) => s.friends);
  const incoming = useFriendsStore((s) => s.incoming);
  const outgoing = useFriendsStore((s) => s.outgoing);
  const blocked = useFriendsStore((s) => s.blocked);
  return ownerId && ownerId === me ? { friends, incoming, outgoing, blocked } : EMPTY_FRIENDS;
}

/** Returns 'friends' when they had already sent you a request (now friends), else 'sent'. */
export async function sendFriendRequest(rawId: string): Promise<'sent' | 'friends'> {
  const to = normalizeId(rawId);
  const result = await call<'sent' | 'friends'>('soniq_friend_request', { p_to: to });
  ping(to);
  await refreshFriends().catch(() => undefined);
  return result;
}

export async function respondToRequest(fromId: string, accept: boolean): Promise<void> {
  await call('soniq_friend_respond', { p_from: fromId, p_accept: accept });
  ping(fromId);
  await refreshFriends().catch(() => undefined);
}

/** Unfriend, or cancel a request you sent. */
export async function removeFriend(otherId: string): Promise<void> {
  await call('soniq_friend_remove', { p_other: otherId });
  ping(otherId);
  await refreshFriends().catch(() => undefined);
}

export async function setBlocked(otherId: string, block: boolean): Promise<void> {
  await call('soniq_friend_block', { p_other: otherId, p_block: block });
  ping(otherId);
  await refreshFriends().catch(() => undefined);
}

/** Shareable link that opens SONIQ's "add friend" screen (via the `invite` Edge Function). */
export function inviteLink(id: string, name: string): string {
  const base = env.supabaseUrl.replace(/\/+$/, '');
  return `${base}/functions/v1/invite?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name.slice(0, 24))}`;
}

/** Link that opens SONIQ's Jam tab and offers to join `code`. */
export function jamLink(code: string): string {
  const base = env.supabaseUrl.replace(/\/+$/, '');
  return `${base}/functions/v1/invite?jam=${encodeURIComponent(code)}`;
}

/** Tell every friend's app to reload (e.g. you started or ended a public Jam). */
export function pingAllFriends(): void {
  for (const f of useFriendsStore.getState().friends) ping(f.id);
}

export function inviteMessage(id: string, name: string): string {
  return `Add me on SONIQ 🎧\n${inviteLink(id, name)}\n\nOr add my ID: ${id}`;
}

// ---------- Live updates ----------
// Each user listens on a Realtime broadcast channel named after their ID. After any
// friend action we "ping" the other person, and their app reloads its lists from the
// server. The ping carries no data (the server still checks everything), so a fake
// ping can only cause a harmless refresh.

const EVENT = 'friends-changed';
const inboxTopic = (id: string) => `inbox:${id}`;

export function ping(otherId: string): void {
  if (!friendsAvailable()) return;
  const db = getSupabase();
  const channel = db.channel(inboxTopic(otherId));
  channel
    .httpSend(EVENT, {})
    .catch(() => undefined)
    .finally(() => void db.removeChannel(channel));
}

let inbox: RealtimeChannel | null = null;
let inboxOwner: string | null = null;
let started = false;

function listen(id: string | null): void {
  if (id === inboxOwner) return;
  const db = getSupabase();
  if (inbox) void db.removeChannel(inbox);
  inbox = null;
  inboxOwner = id;
  if (!id) return;
  inbox = db
    .channel(inboxTopic(id), { config: { broadcast: { self: false, ack: false } } })
    .on('broadcast', { event: EVENT }, () => {
      refreshFriends().catch(() => undefined);
    })
    .subscribe();
}

/** Started once from the root layout: live friend updates + refresh when the app comes back. */
export function startFriendsSync(): void {
  if (started || !friendsAvailable()) return;
  started = true;
  const sync = () => {
    const id = useProfileStore.getState().profile?.id ?? null;
    listen(id);
    if (id) refreshFriends().catch(() => undefined);
  };
  sync();
  // New profile / restored account → listen on the new inbox.
  useProfileStore.subscribe((s, prev) => {
    if (s.profile?.id !== prev.profile?.id) sync();
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      // The socket may have dropped while in the background.
      if (inbox && inbox.state !== 'joined') {
        inboxOwner = null;
        listen(useProfileStore.getState().profile?.id ?? null);
      }
      refreshFriends().catch(() => undefined);
    }
  });
}
