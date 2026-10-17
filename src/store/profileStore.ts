import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SourceId, Track } from '@/sources/types';

export interface Profile {
  /** Stable per-install id, e.g. "SQ-7F3K-2QXA". Used for Jam and (later) recommendations. */
  id: string;
  name: string;
  createdAt: number;
}

export interface PlayRecord {
  trackId: string;
  title: string;
  artist: string;
  source: SourceId;
  at: number;
}

/** Keep the history bounded. */
export const MAX_HISTORY = 200;

interface ProfileState {
  profile: Profile | null;
  plays: number;
  artistCounts: Record<string, number>;
  sourceCounts: Partial<Record<SourceId, number>>;
  genreCounts: Record<string, number>;
  history: PlayRecord[];
  createProfile: (name: string) => Profile;
  rename: (name: string) => void;
  recordPlay: (track: Track) => void;
  recordGenre: (genre: string) => void;
}

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** "SQ-XXXX-XXXX" from an unambiguous alphabet. */
export function makeUserId(random: () => number = Math.random): string {
  const part = () =>
    Array.from({ length: 4 }, () => ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)] ?? 'A').join('');
  return `SQ-${part()}-${part()}`;
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
      artistCounts: {},
      sourceCounts: {},
      genreCounts: {},
      history: [],

      createProfile: (name) => {
        const profile: Profile = {
          id: get().profile?.id ?? makeUserId(),
          name: cleanName(name) || 'Listener',
          createdAt: get().profile?.createdAt ?? Date.now(),
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
            { trackId: track.id, title: track.title, artist: track.artist, source: track.source, at: Date.now() },
            ...s.history,
          ].slice(0, MAX_HISTORY),
        })),

      recordGenre: (genre) =>
        set((s) => ({ genreCounts: { ...s.genreCounts, [genre]: (s.genreCounts[genre] ?? 0) + 1 } })),
    }),
    {
      name: 'soniq:profile',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ profile, plays, artistCounts, sourceCounts, genreCounts, history }) => ({
        profile,
        plays,
        artistCounts,
        sourceCounts,
        genreCounts,
        history,
      }),
      version: 1,
    },
  ),
);
