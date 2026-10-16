import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Cap so the list can't grow forever. */
const MAX_IDS = 500;

interface UnavailableState {
  /** Track ids that failed to resolve a playable stream. Hidden from listings. */
  ids: string[];
  mark: (id: string) => void;
  clear: () => void;
}

/** Written by the player engine when a track cannot be played. */
export const useUnavailableStore = create<UnavailableState>()(
  persist(
    (set) => ({
      ids: [],
      mark: (id) =>
        set((s) => (s.ids.includes(id) ? s : { ids: [id, ...s.ids].slice(0, MAX_IDS) })),
      clear: () => set({ ids: [] }),
    }),
    {
      name: 'soniq:unavailable',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ ids: s.ids }),
      version: 1,
    },
  ),
);

export const isUnavailable = (id: string) => useUnavailableStore.getState().ids.includes(id);
