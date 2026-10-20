import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SourceId, Track } from '@/sources/types';

export interface Profile {
  /** Stable per-install id, e.g. "SQ-7F3K-2QXA". Used for Jam and (later) recommendations. */
  id: string;
  name: string;
  createdAt: number;
  /** Private per-device secret proving this profile is ours to the backend. Never shown. */
  secret: string;
  /** Backup code ("XXXX-XXXX-XXXX-XXXX") to restore this profile after a reinstall. */
  recoveryKey: string;
  /** Profile picture (file:// in the app's folder). Stays on this phone. */
  avatarUri?: string | null;
}

export interface PlayRecord {
  trackId: string;
  title: string;
  artist: string;
  source: SourceId;
  durationSec?: number;
  /** When the play started (epoch ms); also identifies the play. */
  at: number;
  /** Seconds actually listened, set when the song stops/changes. */
  listenedSec?: number;
}

/** Keep the history bounded. */
export const MAX_HISTORY = 200;

interface ProfileState {
  profile: Profile | null;
  plays: number;
  /** Total seconds of music listened (all time). */
  listenedSec: number;
  /** Checkpoint of the song playing now, closed on next start if the app was killed. */
  openListen: { at: number; sec: number } | null;
  artistCounts: Record<string, number>;
  sourceCounts: Partial<Record<SourceId, number>>;
  genreCounts: Record<string, number>;
  history: PlayRecord[];
  createProfile: (name: string) => Profile;
  rename: (name: string) => void;
  recordPlay: (track: Track) => void;
  recordGenre: (genre: string) => void;
  /** Close a play (by its `at`) with the seconds actually listened. */
  finishListen: (at: number, seconds: number) => void;
  setAvatar: (uri: string | null) => void;
}

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** "SQ-XXXX-XXXX" from an unambiguous alphabet. */
export function makeUserId(random: () => number = Math.random): string {
  const part = () =>
    Array.from({ length: 4 }, () => ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)] ?? 'A').join('');
  return `SQ-${part()}-${part()}`;
}

/** 40 random characters; only used to prove profile ownership to our own backend. */
export function makeSecret(random: () => number = Math.random): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 40 }, () => chars[Math.floor(random() * chars.length)] ?? 'a').join('');
}

/** Backup code: 16 characters from an unambiguous alphabet, grouped by 4. */
export function makeRecoveryKey(random: () => number = Math.random): string {
  const part = () =>
    Array.from({ length: 4 }, () => ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)] ?? 'A').join('');
  return `${part()}-${part()}-${part()}-${part()}`;
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, 24);

/** Top `n` keys by count, highest first. */
export function topEntries(counts: Record<string, number | undefined>, n: number): [string, number][] {
  return Object.entries(counts)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);
}

/** Who the user is and what they listen to (local only for now). */
export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      plays: 0,
      listenedSec: 0,
      openListen: null,
      artistCounts: {},
      sourceCounts: {},
      genreCounts: {},
      history: [],

      createProfile: (name) => {
        const profile: Profile = {
          id: get().profile?.id ?? makeUserId(),
          name: cleanName(name) || 'Listener',
          createdAt: get().profile?.createdAt ?? Date.now(),
          secret: get().profile?.secret ?? makeSecret(),
          recoveryKey: get().profile?.recoveryKey ?? makeRecoveryKey(),
          avatarUri: get().profile?.avatarUri ?? null,
        };
        set({ profile });
        return profile;
      },

      rename: (name) => {
        const p = get().profile;
        const clean = cleanName(name);
        if (p && clean) set({ profile: { ...p, name: clean } });
      },

      recordPlay: (track) =>
        set((s) => ({
          plays: s.plays + 1,
          artistCounts: { ...s.artistCounts, [track.artist]: (s.artistCounts[track.artist] ?? 0) + 1 },
          sourceCounts: { ...s.sourceCounts, [track.source]: (s.sourceCounts[track.source] ?? 0) + 1 },
          history: [
            {
              trackId: track.id,
              title: track.title,
              artist: track.artist,
              source: track.source,
              durationSec: track.durationSec,
              at: Date.now(),
            },
            ...s.history,
          ].slice(0, MAX_HISTORY),
        })),

      setAvatar: (uri) => {
        const p = get().profile;
        if (p) set({ profile: { ...p, avatarUri: uri } });
      },

      finishListen: (at, seconds) =>
        set((s) => {
          const sec = Math.max(0, Math.round(seconds));
          const i = s.history.findIndex((h) => h.at === at && h.listenedSec === undefined);
          if (i < 0) return { openListen: null };
          const history = [...s.history];
          history[i] = { ...(history[i] as PlayRecord), listenedSec: sec };
          return { history, listenedSec: s.listenedSec + sec, openListen: null };
        }),

      recordGenre: (genre) =>
        set((s) => ({ genreCounts: { ...s.genreCounts, [genre]: (s.genreCounts[genre] ?? 0) + 1 } })),
    }),
    {
      name: 'soniq:profile',
      storage: createJSONStorage(() => appStorage),
      partialize: ({ profile, plays, listenedSec, openListen, artistCounts, sourceCounts, genreCounts, history }) => ({
        profile,
        plays,
        listenedSec,
        openListen,
        artistCounts,
        sourceCounts,
        genreCounts,
        history,
      }),
      version: 4,
      // v1 plays have no listened time: mark them closed so they are not re-sent as new plays.
      migrate: (persisted, version) => {
        let state = (persisted ?? {}) as Partial<ProfileState>;
        if (version < 2) {
          state = {
            ...state,
            listenedSec: 0,
            openListen: null,
            history: (state.history ?? []).map((h) => ({ ...h, listenedSec: h.listenedSec ?? 0 })),
          };
        }
        // v3: profiles get a private secret for the backend.
        if (version < 3 && state.profile && !state.profile.secret) {
          state = { ...state, profile: { ...state.profile, secret: makeSecret() } };
        }
        // v4: profiles get a backup code.
        if (version < 4 && state.profile && !state.profile.recoveryKey) {
          state = { ...state, profile: { ...state.profile, recoveryKey: makeRecoveryKey() } };
        }
        return state;
      },
    },
  ),
);
