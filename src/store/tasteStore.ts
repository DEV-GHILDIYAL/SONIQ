import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '@/lib/appStorage';

/** A score that fades with time (see decayed() in src/lib/taste.ts). */
export interface Score {
  /** Value at time `t`. */
  s: number;
  /** Last update (epoch ms). */
  t: number;
}

export interface ArtistScore extends Score {
  /** Display name (as last seen). */
  name: string;
}

interface TasteState {
  /** Per song id. */
  tracks: Record<string, Score>;
  /** Per normalised artist name. */
  artists: Record<string, ArtistScore>;
  /** Songs the user said "not interested" to (ids and title|artist keys). */
  notInterested: string[];
  /** Normalised artist names never to recommend. */
  blockedArtists: string[];
  /** `at` of the newest listen already turned into a signal. */
  processedUntil: number;
}

export const useTasteStore = create<TasteState>()(
  persist(
    (): TasteState => ({
      tracks: {},
      artists: {},
      notInterested: [],
      blockedArtists: [],
      processedUntil: 0,
    }),
    {
      name: 'soniq:taste',
      storage: createJSONStorage(() => appStorage),
      version: 1,
    },
  ),
);
