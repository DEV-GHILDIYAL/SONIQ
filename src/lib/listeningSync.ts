/**
 * Uploads listening history to Supabase (tables: profiles, plays — see docs/backend.md)
 * so recommendations can use it later. Works offline: plays wait in a persisted outbox.
 * Started once from the root layout.
 */
import { showSheet } from '@/components/Sheet';
import { useProfileStore, type PlayRecord } from '@/store/profileStore';
import { MAX_OUTBOX, useSyncStore, type PlayRow } from '@/store/syncStore';
import { genreOf } from './playContext';
import { getSupabase, supabaseConfigured } from './supabase';

const FLUSH_DELAY_MS = 5_000;
const BATCH = 100;

let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function queuePlay(row: PlayRow): void {
  useSyncStore.setState((s) => ({ outbox: [...s.outbox, row].slice(-MAX_OUTBOX) }));
  scheduleFlush();
}

function scheduleFlush(delay = FLUSH_DELAY_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushListening();
  }, delay);
}

/** Upload the profile (if renamed) and pending plays. Safe to call any time. */
export async function flushListening(): Promise<void> {
  const profile = useProfileStore.getState().profile;
  if (flushing || !profile || !supabaseConfigured()) return;
  flushing = true;
  try {
    const db = getSupabase();
    // Only these two functions are open to the app (see supabase/setup.sql); tables are private.
    const profileKey = `${profile.name}|${profile.recoveryKey}`;
    if (useSyncStore.getState().syncedName !== profileKey) {
      const { error } = await db.rpc('soniq_upsert_profile', {
        p_id: profile.id,
        p_name: profile.name,
        p_secret: profile.secret,
        p_recovery: profile.recoveryKey,
      });
      if (error) throw new Error(error.message);
      useSyncStore.setState({ syncedName: profileKey });
    }
    for (;;) {
      const batch = useSyncStore.getState().outbox.slice(0, BATCH);
      if (batch.length === 0) break;
      const rows = batch.map(({ user_id: _owner, ...row }) => row);
      const { error } = await db.rpc('soniq_add_plays', {
        p_id: profile.id,
        p_secret: profile.secret,
        p_rows: rows,
      });
      if (error) throw new Error(error.message);
      useSyncStore.setState((s) => ({ outbox: s.outbox.slice(batch.length) }));
    }
  } catch (err) {
    // Our device secret was replaced: the account was signed in on another phone.
    if (err instanceof Error && /not allowed/i.test(err.message)) {
      signedOutElsewhere();
      return;
    }
    console.warn('[sync] listening history upload failed, will retry:', err);
    scheduleFlush(60_000);
  } finally {
    flushing = false;
  }
}

function toRow(userId: string, play: PlayRecord): PlayRow {
  return {
    user_id: userId,
    track_id: play.trackId,
    title: play.title,
    artist: play.artist,
    source: play.source,
    genre: genreOf(play.trackId),
    duration_sec: play.durationSec ? Math.round(play.durationSec) : null,
    listened_sec: play.listenedSec ?? 0,
    played_at: new Date(play.at).toISOString(),
  };
}

let started = false;

/**
 * One phone at a time: another phone signed in with this account, so this one is signed out.
 * The profile is cleared (Onboarding shows); signing in again here moves the account back.
 */
function signedOutElsewhere(): void {
  const profile = useProfileStore.getState().profile;
  if (!profile) return;
  useSyncStore.setState({ outbox: [], syncedName: null });
  useProfileStore.setState({ profile: null });
  showSheet(
    'Signed out on this phone',
    `Your SONIQ account (${profile.id}) was opened on another phone. To use it here again, choose ` +
      '"I already have an account" and enter your ID and backup code. That signs the other phone out.',
  );
}

/** Plays that just got their listened time (closed since `prev`). */
function newlyClosed(history: readonly PlayRecord[], prev: readonly PlayRecord[]): PlayRecord[] {
  const wasOpen = new Set(prev.filter((h) => h.listenedSec === undefined).map((h) => h.at));
  return history.filter((h) => h.listenedSec !== undefined && wasOpen.has(h.at));
}

/** Close plays left open by a killed app: use the last checkpoint, else 0 s. */
function closeLeftoverPlays(): void {
  const store = useProfileStore.getState();
  const open = store.openListen;
  for (const h of store.history) {
    if (h.listenedSec !== undefined) continue;
    store.finishListen(h.at, open?.at === h.at ? open.sec : 0);
  }
}

/**
 * Mirror finished plays to the backend. A play is sent when it ends (song changed,
 * queue ended, sleep timer) so the row includes how many seconds were listened.
 */
export function startListeningSync(): void {
  if (started) return;
  started = true;
  // Check in with the server once per launch (also finds out if another phone signed in).
  const checkIn = () => {
    if (!useProfileStore.getState().profile) return;
    useSyncStore.setState({ syncedName: null });
    scheduleFlush(3_000);
  };
  if (useSyncStore.persist.hasHydrated() && useProfileStore.persist.hasHydrated()) checkIn();
  else useSyncStore.persist.onFinishHydration(() => setTimeout(checkIn, 500));
  useProfileStore.subscribe((s, prev) => {
    if (!s.profile || s.history === prev.history) return;
    for (const h of newlyClosed(s.history, prev.history)) queuePlay(toRow(s.profile.id, h));
  });
  const close = () => closeLeftoverPlays();
  if (useProfileStore.persist.hasHydrated()) close();
  else useProfileStore.persist.onFinishHydration(close);
  scheduleFlush(3_000);
}
