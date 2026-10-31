/**
 * Public playlists (community). A playlist is private (phone only) until its owner makes it
 * public; then a copy lives on Supabase (soniq_playlist_* functions) that anyone can play,
 * and every edit by the owner is pushed to it. Others can save their own private copy.
 */
import type { Track } from '@/sources/types';
import { useProfileStore } from '@/store/profileStore';
import { usePlaylistStore, type Playlist } from '@/store/playlistStore';
import { env } from './env';
import { flushListening } from './listeningSync';
import { getSupabase, supabaseConfigured } from './supabase';

export const publicPlaylistsAvailable = (): boolean => supabaseConfigured();

export const PUBLIC_MAX_SONGS = 500;

export interface PublicPlaylistCard {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  track_count: number;
  covers: string[];
  plays: number;
  saves: number;
  updated_at: string;
}

export interface PublicPlaylist extends PublicPlaylistCard {
  tracks: Track[];
}

export type DiscoverSort = 'trending' | 'new';

function readable(message: string): string {
  if (/no such playlist/i.test(message)) return 'This playlist is private now, or was deleted.';
  if (/public playlist limit/i.test(message)) return 'You can have up to 50 public playlists.';
  if (/too many songs/i.test(message))
    return `Public playlists can have up to ${PUBLIC_MAX_SONGS} songs.`;
  if (/not allowed/i.test(message)) return 'This phone is not signed in to your account anymore.';
  if (/network|fetch|timeout/i.test(message)) return 'No internet. Try again.';
  return message;
}

async function rpc<T>(fn: string, args: Record<string, unknown>, signed: boolean): Promise<T> {
  if (!publicPlaylistsAvailable())
    throw new Error('Community playlists are not available in this build.');
  let auth: Record<string, string> = {};
  if (signed) {
    const profile = useProfileStore.getState().profile;
    if (!profile) throw new Error('Create your profile first.');
    await flushListening(); // makes sure our profile exists on the server
    auth = { p_id: profile.id, p_secret: profile.secret };
  }
  const { data, error } = await getSupabase().rpc(fn, { ...auth, ...args });
  if (error) throw new Error(readable(error.message));
  return data as T;
}

/** Songs others can play: files on this phone stay private. */
function shareable(tracks: readonly Track[]): Track[] {
  return tracks.filter((t) => t.source !== 'local').slice(0, PUBLIC_MAX_SONGS);
}

/** Cheap fingerprint of name + song ids, to know whether the server copy is out of date. */
function fingerprint(p: Pick<Playlist, 'name' | 'tracks'>): string {
  let h = 5381;
  const text = `${p.name}\n${shareable(p.tracks)
    .map((t) => t.id)
    .join('\n')}`;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${h >>> 0}`;
}

async function upload(p: Playlist): Promise<string> {
  const tracks = shareable(p.tracks);
  const id = await rpc<string>(
    'soniq_playlist_publish',
    { p_playlist: p.publicId ?? null, p_name: p.name, p_tracks: tracks },
    true,
  );
  usePlaylistStore.getState().setPublic(p.id, id, fingerprint(p));
  return id;
}

/** Make a playlist public (or push its latest songs). Returns the community id. */
export async function publishPlaylist(localId: string): Promise<string> {
  const p = usePlaylistStore.getState().playlists.find((x) => x.id === localId);
  if (!p) throw new Error('Playlist not found.');
  return upload(p);
}

/** Back to private: the community copy is deleted. */
export async function unpublishPlaylist(localId: string): Promise<void> {
  const p = usePlaylistStore.getState().playlists.find((x) => x.id === localId);
  if (!p?.publicId) return;
  await rpc('soniq_playlist_unpublish', { p_playlist: p.publicId }, true);
  usePlaylistStore.getState().setPublic(localId, undefined);
}

export function getPublicPlaylist(id: string): Promise<PublicPlaylist> {
  return rpc<PublicPlaylist>('soniq_playlist_get', { p_playlist: id }, false);
}

export function discoverPlaylists(
  sort: DiscoverSort,
  query = '',
  limit = 20,
  offset = 0,
): Promise<PublicPlaylistCard[]> {
  return rpc<PublicPlaylistCard[]>(
    'soniq_playlist_discover',
    { p_sort: sort, p_query: query, p_limit: limit, p_offset: offset },
    false,
  );
}

/** Count a play of someone's public playlist (once per day per user; best effort). */
export function recordPublicPlay(id: string): void {
  rpc('soniq_playlist_event', { p_playlist: id, p_kind: 'play' }, true).catch(() => undefined);
}

/** Save your own private copy of a public playlist. Returns the new local playlist. */
export function savePublicPlaylist(p: PublicPlaylist): Playlist {
  const copy = usePlaylistStore
    .getState()
    .importPlaylist(p.name, p.tracks, { id: p.id, owner: p.owner_name });
  rpc('soniq_playlist_event', { p_playlist: p.id, p_kind: 'save' }, true).catch(() => undefined);
  return copy;
}

export function reportPublicPlaylist(id: string, reason: string): Promise<void> {
  return rpc('soniq_playlist_report', { p_playlist: id, p_reason: reason }, true);
}

/** Is this public playlist one of mine? */
export function isMine(card: Pick<PublicPlaylistCard, 'owner_id'>): boolean {
  return card.owner_id === useProfileStore.getState().profile?.id;
}

/** Link that opens the playlist in SONIQ (works from WhatsApp etc.). */
export function playlistLink(publicId: string): string {
  const base = env.supabaseUrl.replace(/\/+$/, '');
  return `${base}/functions/v1/invite?playlist=${encodeURIComponent(publicId)}`;
}

// ---------- Keep public copies up to date ----------

const PUSH_DELAY_MS = 3_000;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;

async function pushChanged(): Promise<void> {
  if (pushing) return;
  pushing = true;
  try {
    const { playlists } = usePlaylistStore.getState();
    for (const p of playlists) {
      if (!p.publicId || p.publicSynced === fingerprint(p)) continue;
      try {
        await upload(p);
      } catch (err) {
        // Deleted on the server (or signed out): treat as private again.
        if (err instanceof Error && /private now|not signed in/i.test(err.message)) {
          usePlaylistStore.getState().setPublic(p.id, undefined);
        }
      }
    }
  } finally {
    pushing = false;
  }
}

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushChanged();
  }, PUSH_DELAY_MS);
}

let started = false;

/**
 * Started once from the root layout: pushes edits of public playlists (also ones made
 * offline), and removes the community copy when a public playlist is deleted.
 */
export function startPublicPlaylistSync(): void {
  if (started || !publicPlaylistsAvailable()) return;
  started = true;
  usePlaylistStore.subscribe((state, prev) => {
    const now = new Set(state.playlists.map((p) => p.id));
    for (const old of prev.playlists) {
      if (old.publicId && !now.has(old.id)) {
        rpc('soniq_playlist_unpublish', { p_playlist: old.publicId }, true).catch(() => undefined);
      }
    }
    if (state.playlists.some((p) => p.publicId && p.publicSynced !== fingerprint(p)))
      schedulePush();
  });
  schedulePush(); // anything changed while offline / before the app closed
}
