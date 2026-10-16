import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Track } from '@/sources/types';

export const MAX_RECENT = 20;

interface RecentState {
  tracks: Track[];
  /** Move/insert a track at the front. Written by the player engine only. */
  add: (track: Track) => void;
  clear: () => void;
}

export const useRecentStore = create<RecentState>()(
  persist(
    (set) => ({
      tracks: [],
      add: (track) =>
        set((s) => ({
          tracks: [track, ...s.tracks.filter((t) => t.id !== track.id)].slice(0, MAX_RECENT),
        })),
      clear: () => set({ tracks: [] }),
    }),
    {
      name: 'soniq:recent',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ tracks: s.tracks }),
      version: 1,
    },
  ),
);
