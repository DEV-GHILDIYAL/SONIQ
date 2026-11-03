/**
 * Account backup & restore (no login). Liked songs, playlists, recent searches and settings
 * are backed up to Supabase a few seconds after they change. After a reinstall the user types
 * their SONIQ ID + backup code (Profile page) to get everything back.
 * Backend: soniq_save_library / soniq_restore_v2 in supabase/setup.sql.
 */
import { AppState } from 'react-native';
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
  banner?: string | null;
}

function snapshot(): LibraryBackup {
  return {
    v: BACKUP_VERSION,
    liked: useLikedStore.getState().tracks.slice(0, 2000),
    playlists: usePlaylistStore.getState().playlists,
    searches: useSearchHistoryStore.getState().items,
    settings: { autoplay: useSettingsStore.getState().autoplay },
    streak: (({ current, best, lastDay, days }) => ({ current, best, lastDay, days }))(
      useStreakStore.getState(),
    ),
    avatar: useProfileStore.getState().profile?.avatarUrl ?? null,
    banner: useProfileStore.getState().profile?.bannerUrl ?? null,
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

/** Add what another device saved (liked songs, playlists, playlist songs). Never removes. */
function mergeRemote(lib: Partial<LibraryBackup>): void {
  if (Array.isArray(lib.liked)) {
    const local = useLikedStore.getState().tracks;
    const have = new Set(local.map((t) => t.id));
    const extra = lib.liked.filter((t) => t && !have.has(t.id));
    if (extra.length > 0) useLikedStore.setState({ tracks: [...local, ...extra] });
  }
  if (Array.isArray(lib.playlists)) {
    const local = usePlaylistStore.getState().playlists;
    const byId = new Map(local.map((p) => [p.id, p]));
    let changed = false;
    const merged = local.map((p) => {
      const remote = lib.playlists?.find((r) => r.id === p.id);
      if (!remote) return p;
      const have = new Set(p.tracks.map((t) => t.id));
      const extra = remote.tracks.filter((t) => !have.has(t.id));
      if (extra.length === 0) return p;
      changed = true;
      return { ...p, tracks: [...p.tracks, ...extra] };
    });
    const added = lib.playlists.filter((r) => r && !byId.has(r.id));
    if (added.length > 0 || changed)
      usePlaylistStore.setState({ playlists: [...merged, ...added] });
  }
  if (lib.streak) {
    const s = useStreakStore.getState();
    if ((lib.streak.best ?? 0) > s.best) useStreakStore.setState({ best: lib.streak.best });
  }
}

let pulling: Promise<void> | null = null;

/** Fetch the cloud library and merge it if another device changed it since we last looked. */
export function pullLibrary(): Promise<void> {
  if (pulling) return pulling;
  const run = (async () => {
    const profile = useProfileStore.getState().profile;
    if (!profile || restoring || !supabaseConfigured()) return;
    const { data, error } = await getSupabase().rpc('soniq_get_library', {
      p_id: profile.id,
      p_secret: profile.secret,
    });
    if (error) return;
    const row = data as { data?: Partial<LibraryBackup>; updated_at?: string } | null;
    if (!row?.updated_at || row.updated_at === useSyncStore.getState().remoteAt) return;
    if (row.data) mergeRemote(row.data);
    useSyncStore.setState({ remoteAt: row.updated_at });
  })().catch(() => undefined);
  pulling = run;
  void run.finally(() => {
    if (pulling === run) pulling = null;
  });
  return run;
}

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
    // Another device (phone / laptop) may have saved meanwhile: take its additions first.
    await pullLibrary();
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
    if (
      s.profile?.avatarUrl !== prev.profile?.avatarUrl ||
      s.profile?.bannerUrl !== prev.profile?.bannerUrl
    ) {
      onChange();
    }
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
  // Back in the app: pick up what the other device (phone / laptop) saved meanwhile.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void pullLibrary();
  });
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
  const c = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^SQ/, '');
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
  const { data, error } = await getSupabase().rpc('soniq_restore_v2', {
    p_id: id,
    p_recovery: code,
    p_new_secret: secret,
  });
  const failure = error?.message ?? (data as { error?: string } | null)?.error;
  if (failure) {
    throw new Error(
      /wrong id or code/i.test(failure)
        ? 'ID or backup code is wrong. Check both and try again.'
        : /locked/i.test(failure)
          ? 'Too many wrong tries for this ID. Wait an hour and try again.'
          : `Couldn't restore: ${failure}`,
    );
  }
  return applyAccount(data as RestoreResponse, secret, code, false);
}

/** Put a restored / linked account on this device (library, history, photos). */
async function applyAccount(
  r: RestoreResponse,
  secret: string,
  code: string,
  linked: boolean,
): Promise<string> {
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
    const oldBanner = useProfileStore.getState().profile?.bannerUri ?? null;
    const remoteAvatar =
      typeof lib.avatar === 'string' && /^https?:\/\//i.test(lib.avatar) ? lib.avatar : null;
    const remoteBanner =
      typeof lib.banner === 'string' && /^https?:\/\//i.test(lib.banner) ? lib.banner : null;
    // Cache them locally so they still show without a connection.
    const localAvatar = remoteAvatar ? await fetchAvatar(remoteAvatar) : null;
    const localBanner = remoteBanner ? await fetchAvatar(remoteBanner, 'banner') : null;
    useProfileStore.setState({
      profile: {
        id: r.id,
        name: r.name,
        createdAt: new Date(r.created_at).getTime(),
        secret,
        recoveryKey: code,
        linked,
        avatarUri: localAvatar ?? remoteAvatar,
        avatarUrl: remoteAvatar,
        bannerUri: localBanner ?? remoteBanner,
        bannerUrl: remoteBanner,
      },
      plays: history.length,
      listenedSec: history.reduce((n, h) => n + (h.listenedSec ?? 0), 0),
      openListen: null,
      artistCounts,
      sourceCounts,
      history: history.slice(0, 200),
    });
    if (oldAvatar && oldAvatar !== localAvatar) deleteAvatar(oldAvatar);
    if (oldBanner && oldBanner !== localBanner) deleteAvatar(oldBanner);
    useSyncStore.setState({ syncedName: `${r.name}|${code}`, outbox: [], remoteAt: null });
  } finally {
    restoring = false;
  }
  return r.name;
}

/** Normalise a device-link code ("abcd efgh" -> "ABCDEFGH"). */
export function normalizeLinkCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

/**
 * Link this device to an account that is signed in elsewhere (code from Profile › Link a
 * device on the other device). The other device stays signed in.
 */
export async function linkThisDevice(rawCode: string, deviceName: string): Promise<string> {
  if (!supabaseConfigured()) throw new Error('Accounts are not set up in this build.');
  const secret = makeSecret();
  const { data, error } = await getSupabase().rpc('soniq_link_claim', {
    p_code: normalizeLinkCode(rawCode),
    p_new_secret: secret,
    p_device_name: deviceName,
  });
  const failure = error?.message ?? (data as { error?: string } | null)?.error;
  if (failure) {
    throw new Error(
      /wrong or expired/i.test(failure)
        ? 'That code is wrong or expired. Make a new one on your phone and try again.'
        : /locked/i.test(failure)
          ? 'Too many wrong codes. Wait a while and try again.'
          : /could not find the function|soniq_link_claim/i.test(failure)
            ? 'Linking needs a server update. Ask the SONIQ admin to run the latest setup.sql.'
            : `Couldn't link: ${failure}`,
    );
  }
  return applyAccount(data as RestoreResponse, secret, '', true);
}
