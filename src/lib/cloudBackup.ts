/**
 * Account backup & restore (no login). Liked songs, playlists, recent searches and settings
 * are backed up to Supabase a few seconds after they change. After a reinstall the user types
 * their SONIQ ID + backup code (Profile page) to get everything back.
 * Backend: soniq_save_library / soniq_restore in supabase/setup.sql.
 */
import type { SourceId, Track } from '@/sources/types';
import { useLikedStore } from '@/store/likedStore';
import { usePlaylistStore, type Playlist } from '@/store/playlistStore';
import { makeSecret, useProfileStore, type PlayRecord } from '@/store/profileStore';
import { useSearchHistoryStore, type RecentSearch } from '@/store/searchHistoryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStreakStore } from '@/store/streakStore';
import { useSyncStore } from '@/store/syncStore';
import { deleteAvatar, fetchAvatar, uploadAvatar } from './avatar';
import { getSupabase, supabaseConfigured } from './supabase';

const SAVE_DELAY_MS = 8_000;
const BACKUP_VERSION = 2;

interface LibraryBackup {
  v: number;
  liked: Track[];
  playlists: Playlist[];
  searches: RecentSearch[];
  settings: { autoplay: boolean };
  streak?: { current: number; best: number; lastDay: string | null; days: string[] };
  /** Public Supabase Storage URL of the profile photo. */
  avatar?: string | null;
}

function snapshot(): LibraryBackup {
  return {
    v: BACKUP_VERSION,
    liked: useLikedStore.getState().tracks.slice(0, 2000),
    playlists: usePlaylistStore.getState().playlists,
    searches: useSearchHistoryStore.getState().items,
    settings: { autoplay: useSettingsStore.getState().autoplay },
    streak: (({ current, best, lastDay, days }) => ({ current, best, lastDay, days }))(useStreakStore.getState()),
    avatar: useProfileStore.getState().profile?.avatarUrl ?? null,
  };
}

/** Short fingerprint of a string (djb2), to tell if the backup changed. */
function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${h >>> 0}`;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let restoring = false;

async function saveNow(): Promise<void> {
  const profile = useProfileStore.getState().profile;
  if (!profile || restoring || !supabaseConfigured()) return;
  try {
    // The profile must exist on the server first (created by listening sync).
    const profileKey = `${profile.name}|${profile.recoveryKey}`;
    if (useSyncStore.getState().syncedName !== profileKey) {
      const { error } = await getSupabase().rpc('soniq_upsert_profile', {
        p_id: profile.id,
        p_name: profile.name,
        p_secret: profile.secret,
        p_recovery: profile.recoveryKey,
      });
      if (error) throw new Error(error.message);
      useSyncStore.setState({ syncedName: profileKey });
    }
    const data = snapshot();
    // Nothing changed since the last upload (e.g. just opened the app): skip it.
    const hash = `${profile.id}|${fingerprint(JSON.stringify(data))}`;
    if (useSyncStore.getState().backupHash === hash) return;
    const { error } = await getSupabase().rpc('soniq_save_library', {
      p_id: profile.id,
      p_secret: profile.secret,
      p_data: data,
    });
    if (error) throw new Error(error.message);
    useSyncStore.setState({ backupHash: hash });
  } catch (err) {
    if (err instanceof Error && /not allowed/i.test(err.message)) return; // signed in on another phone
    console.warn('[backup] cloud backup failed, will retry:', err);
    scheduleSave(60_000);
  }
}

function scheduleSave(delay = SAVE_DELAY_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void saveNow();
  }, delay);
}

/** Save right away (e.g. after a photo upload) instead of waiting for the debounce. */
export function backupNow(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  void saveNow();
}

let started = false;

/** Back up the library whenever liked songs, playlists, searches or settings change. */
export function startCloudBackup(): void {
  if (started) return;
  started = true;
  const onChange = () => scheduleSave();
  useLikedStore.subscribe(onChange);
  usePlaylistStore.subscribe(onChange);
  useSearchHistoryStore.subscribe(onChange);
  useSettingsStore.subscribe(onChange);
  useStreakStore.subscribe((s, prev) => {
    if (s.lastDay !== prev.lastDay) onChange();
  });
  useProfileStore.subscribe((s, prev) => {
    if (s.profile?.avatarUrl !== prev.profile?.avatarUrl) onChange();
  });
  // Photos picked before cloud backup existed are local-only: upload them once so the
  // account restore can bring them back too.
  const uploadExistingAvatar = () => {
    const profile = useProfileStore.getState().profile;
    if (!profile?.avatarUri?.startsWith('file://') || profile.avatarUrl) return;
    void uploadAvatar(profile.id, profile.avatarUri).then((url) => {
      if (!url) return;
      useProfileStore.getState().setAvatarUrl(url);
      backupNow();
    });
  };
  if (useProfileStore.persist.hasHydrated()) uploadExistingAvatar();
  else useProfileStore.persist.onFinishHydration(uploadExistingAvatar);
  scheduleSave(5_000);
}

interface RestoreResponse {
  id: string;
  name: string;
  created_at: string;
  library: Partial<LibraryBackup> | null;
  plays: {
    track_id: string;
    title: string;
    artist: string;
    source: string;
    duration_sec: number | null;
    listened_sec: number | null;
    played_at: string;
  }[];
}

/** Turn "sq 7f3k 2qxa" / "K9P27XQAM4TBW8HC" into the canonical formats. */
export function normalizeId(raw: string): string {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SQ/, '');
  return c.length === 8 ? `SQ-${c.slice(0, 4)}-${c.slice(4)}` : raw.trim().toUpperCase();
}
export function normalizeCode(raw: string): string {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 16 ? (c.match(/.{4}/g) ?? []).join('-') : raw.trim().toUpperCase();
}

/**
 * Restore a profile on this install. Replaces the local profile, liked songs, playlists,
 * recent searches, settings and play history. Throws a readable error on a wrong code.
 */
export async function restoreAccount(rawId: string, rawCode: string): Promise<string> {
  if (!supabaseConfigured()) throw new Error('Backup is not set up in this build.');
  const id = normalizeId(rawId);
  const code = normalizeCode(rawCode);
  const secret = makeSecret();
  const { data, error } = await getSupabase().rpc('soniq_restore', {
    p_id: id,
    p_recovery: code,
    p_new_secret: secret,
  });
  if (error) {
    throw new Error(
      /wrong id or code/i.test(error.message)
        ? 'ID or backup code is wrong. Check both and try again.'
        : `Couldn't restore: ${error.message}`,
    );
  }
  const r = data as RestoreResponse;
  restoring = true;
  try {
    const lib = r.library ?? {};
    if (lib.liked) useLikedStore.setState({ tracks: lib.liked });
    if (lib.playlists) usePlaylistStore.setState({ playlists: lib.playlists });
    if (lib.searches) useSearchHistoryStore.setState({ items: lib.searches });
    if (lib.settings) useSettingsStore.setState({ autoplay: lib.settings.autoplay });
    if (lib.streak) useStreakStore.setState({ ...lib.streak, celebrate: null });

    // Rebuild local listening stats from the server's recent plays (already uploaded: closed).
    const history: PlayRecord[] = r.plays.map((p) => ({
      trackId: p.track_id,
      title: p.title,
      artist: p.artist,
      source: p.source as SourceId,
      durationSec: p.duration_sec ?? undefined,
      at: new Date(p.played_at).getTime(),
      listenedSec: p.listened_sec ?? 0,
    }));
    const artistCounts: Record<string, number> = {};
    const sourceCounts: Partial<Record<SourceId, number>> = {};
    for (const h of history) {
      artistCounts[h.artist] = (artistCounts[h.artist] ?? 0) + 1;
      sourceCounts[h.source] = (sourceCounts[h.source] ?? 0) + 1;
    }
    const oldAvatar = useProfileStore.getState().profile?.avatarUri ?? null;
    const remoteAvatar =
      typeof lib.avatar === 'string' && /^https?:\/\//i.test(lib.avatar) ? lib.avatar : null;
    // Cache it locally so the photo still shows without a connection.
    const localAvatar = remoteAvatar ? await fetchAvatar(remoteAvatar) : null;
    useProfileStore.setState({
      profile: {
        id: r.id,
        name: r.name,
        createdAt: new Date(r.created_at).getTime(),
        secret,
        recoveryKey: code,
        avatarUri: localAvatar ?? remoteAvatar,
        avatarUrl: remoteAvatar,
      },
      plays: history.length,
      listenedSec: history.reduce((n, h) => n + (h.listenedSec ?? 0), 0),
      openListen: null,
      artistCounts,
      sourceCounts,
      history: history.slice(0, 200),
    });
    if (oldAvatar && oldAvatar !== localAvatar) deleteAvatar(oldAvatar);
    useSyncStore.setState({ syncedName: `${r.name}|${code}`, outbox: [] });
  } finally {
    restoring = false;
  }
  return r.name;
}
