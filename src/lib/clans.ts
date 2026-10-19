/**
 * Clans: invite-only groups with a small chat and Jam cards (Supabase functions soniq_clan_*).
 * Live updates: each clan has a Realtime broadcast channel `clan:<id>`; after any change we
 * send a data-less ping there and members' apps reload from the server.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { useClansStore, type ClanDetail, type ClanSummary } from '@/store/clansStore';
import { useProfileStore } from '@/store/profileStore';
import { env } from './env';
import { flushListening } from './listeningSync';
import { getSupabase, supabaseConfigured } from './supabase';

export const clansAvailable = (): boolean => supabaseConfigured();

export const CLAN_MAX_MEMBERS = 30;
export const CLAN_MESSAGE_MAX = 300;
export const CLAN_EMOJIS = ['🎧', '🔥', '🌙', '🎸', '💜', '🚀', '🌊', '🎤', '☕', '🎮', '🌸', '👑'];

function readable(message: string): string {
  if (/no such clan/i.test(message)) return 'No clan with that code. Check it and try again.';
  if (/clan full/i.test(message)) return `This clan is full (${CLAN_MAX_MEMBERS} members).`;
  if (/removed from clan/i.test(message)) return 'The owner removed you from this clan.';
  if (/not a member/i.test(message)) return "You're not in this clan anymore.";
  if (/clan limit/i.test(message)) return 'You can own up to 5 clans.';
  if (/too many clans/i.test(message)) return 'You can be in up to 20 clans.';
  if (/bad name/i.test(message)) return 'Clan name needs at least 2 letters.';
  if (/owner only/i.test(message)) return 'Only the clan owner can do that.';
  if (/rate limited/i.test(message)) return 'Slow down a bit 🙂 Try again in a minute.';
  if (/network|fetch|timeout/i.test(message)) return 'No internet. Try again.';
  return message;
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const profile = useProfileStore.getState().profile;
  if (!profile || !clansAvailable()) throw new Error('Clans are not available in this build.');
  await flushListening(); // make sure our profile exists on the server
  const { data, error } = await getSupabase().rpc(fn, {
    p_id: profile.id,
    p_secret: profile.secret,
    ...args,
  });
  if (error) throw new Error(readable(error.message));
  return data as T;
}

/** Tell members' apps that something changed in this clan. */
function pingClan(id: string): void {
  const db = getSupabase();
  const channel = db.channel(`clan:${id}`);
  channel
    .httpSend('changed', {})
    .catch(() => undefined)
    .finally(() => void db.removeChannel(channel));
}

// ---------- Reads ----------

let refreshing: Promise<void> | null = null;

export function refreshClans(): Promise<void> {
  if (refreshing) return refreshing;
  const run = (async () => {
    const me = useProfileStore.getState().profile?.id;
    if (!me) return;
    const clans = await call<ClanSummary[]>('soniq_clans_list');
    useClansStore.getState().setClans(me, clans ?? []);
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

/** Your clans (empty if the cache belongs to another account). */
export function useClans(): ClanSummary[] {
  const ownerId = useClansStore((s) => s.ownerId);
  const me = useProfileStore((s) => s.profile?.id ?? null);
  const clans = useClansStore((s) => s.clans);
  return ownerId && ownerId === me ? clans : [];
}

/** Load a clan's members + messages (marks them read). Removes it locally if you're no longer in it. */
export async function loadClan(id: string): Promise<ClanDetail> {
  try {
    const detail = await call<ClanDetail>('soniq_clan_open', { p_clan: id });
    useClansStore.getState().setDetail(detail);
    return detail;
  } catch (err) {
    if (err instanceof Error && /anymore|not a member/i.test(err.message))
      useClansStore.getState().removeClan(id);
    throw err;
  }
}

// ---------- Writes ----------

export async function createClan(
  name: string,
  emoji: string,
): Promise<{ id: string; code: string }> {
  const result = await call<{ id: string; code: string }>('soniq_clan_create', {
    p_name: name,
    p_emoji: emoji,
  });
  await refreshClans().catch(() => undefined);
  return result;
}

export function normalizeClanCode(raw: string): string {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Accept a pasted invite link too.
  const fromLink = /CLAN([A-Z0-9]{8})/.exec(code)?.[1];
  return fromLink ?? code.slice(0, 8);
}

export async function joinClan(rawCode: string): Promise<{ id: string; name: string }> {
  const result = await call<{ id: string; name: string }>('soniq_clan_join', {
    p_code: normalizeClanCode(rawCode),
  });
  pingClan(result.id);
  await refreshClans().catch(() => undefined);
  return result;
}

export async function leaveClan(id: string): Promise<void> {
  await call('soniq_clan_leave', { p_clan: id });
  pingClan(id);
  useClansStore.getState().removeClan(id);
  await refreshClans().catch(() => undefined);
}

export async function deleteClan(id: string): Promise<void> {
  await call('soniq_clan_delete', { p_clan: id });
  pingClan(id);
  useClansStore.getState().removeClan(id);
  await refreshClans().catch(() => undefined);
}

export async function kickFromClan(id: string, userId: string): Promise<void> {
  await call('soniq_clan_kick', { p_clan: id, p_user: userId });
  pingClan(id);
  await loadClan(id).catch(() => undefined);
}

export async function resetClanCode(id: string): Promise<string> {
  const code = await call<string>('soniq_clan_reset_code', { p_clan: id });
  await loadClan(id).catch(() => undefined);
  return code;
}

export async function sendClanMessage(id: string, text: string): Promise<void> {
  const body = text.trim().slice(0, CLAN_MESSAGE_MAX);
  if (!body) return;
  await call('soniq_clan_send', { p_clan: id, p_body: body, p_jam: null });
  pingClan(id);
  await loadClan(id).catch(() => undefined);
}

/** Post a Jam card ("Dev started a Jam · Join") in the clan chat. */
export async function shareJamToClan(id: string, jamCode: string): Promise<void> {
  await call('soniq_clan_send', { p_clan: id, p_body: '', p_jam: jamCode });
  // Your older Jam cards (any clan) are now "ended": refresh them everywhere.
  for (const c of useClansStore.getState().clans) pingClan(c.id);
  pingClan(id);
  await loadClan(id).catch(() => undefined);
}

/** A Jam ended: its cards in your clans show "Jam ended" instead of Join. Best effort. */
export async function endJamCards(jamCode: string): Promise<void> {
  if (!clansAvailable() || !useProfileStore.getState().profile) return;
  if (useClansStore.getState().clans.length === 0) return;
  const ids = await call<string[]>('soniq_clan_jam_end', { p_code: jamCode });
  for (const id of ids ?? []) pingClan(id);
  if (activeClan && ids?.includes(activeClan)) void loadClan(activeClan).catch(() => undefined);
}

// ---------- Links ----------

export function clanLink(code: string): string {
  const base = env.supabaseUrl.replace(/\/+$/, '');
  return `${base}/functions/v1/invite?clan=${encodeURIComponent(code)}`;
}

export function clanInviteMessage(name: string, code: string): string {
  return `Join my SONIQ clan "${name}" 🎧\n${clanLink(code)}\n\nOr open SONIQ → Clans → Join and enter: ${code}`;
}

// ---------- Live updates ----------

const channels = new Map<string, RealtimeChannel>();
/** Clan whose chat is on screen: its pings reload the chat (and mark it read). */
let activeClan: string | null = null;
let started = false;

export function setActiveClan(id: string | null): void {
  activeClan = id;
}

function onPing(id: string): void {
  if (id === activeClan) void loadClan(id).catch(() => undefined);
  refreshClans().catch(() => undefined);
}

/** Subscribe to every clan you're in; drop channels of clans you left. */
function reconcile(): void {
  if (!clansAvailable()) return;
  const db = getSupabase();
  const want = new Set(useClansStore.getState().clans.map((c) => c.id));
  for (const [id, ch] of channels) {
    if (!want.has(id)) {
      void db.removeChannel(ch);
      channels.delete(id);
    }
  }
  for (const id of want) {
    const existing = channels.get(id);
    if (existing && existing.state !== 'closed' && existing.state !== 'errored') continue;
    if (existing) void db.removeChannel(existing);
    const ch = db
      .channel(`clan:${id}`, { config: { broadcast: { self: false, ack: false } } })
      .on('broadcast', { event: 'changed' }, () => onPing(id))
      .subscribe();
    channels.set(id, ch);
  }
}

/** Started once from the root layout. */
export function startClansSync(): void {
  if (started || !clansAvailable()) return;
  started = true;
  useClansStore.subscribe((s, prev) => {
    if (s.clans !== prev.clans) reconcile();
  });
  useProfileStore.subscribe((s, prev) => {
    if (s.profile?.id !== prev.profile?.id) refreshClans().catch(() => undefined);
  });
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    reconcile();
    if (activeClan) void loadClan(activeClan).catch(() => undefined);
    refreshClans().catch(() => undefined);
  });
  reconcile();
  refreshClans().catch(() => undefined);
}
