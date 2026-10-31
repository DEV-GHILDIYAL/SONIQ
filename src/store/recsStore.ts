import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '@/lib/appStorage';
import type { Track } from '@/sources/types';

export interface Mix {
  id: string;
  kind: 'repeat' | 'daily' | 'fresh' | 'because';
  title: string;
  subtitle: string;
  /** "Because you liked …": the song it is based on. */
  seedTitle?: string;
  tracks: Track[];
}

interface RecsState {
  mixes: Mix[];
  builtAt: number;
  building: boolean;
}

/** Cached "Made for you" mixes (built by src/lib/recommendations.ts). */
export const useRecsStore = create<RecsState>()(
  persist((): RecsState => ({ mixes: [], builtAt: 0, building: false }), {
    name: 'soniq:recs',
    storage: createJSONStorage(() => appStorage),
    partialize: (s) => ({ mixes: s.mixes, builtAt: s.builtAt }),
    version: 1,
  }),
);
