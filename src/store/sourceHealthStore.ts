import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SourceHealth, SourceId } from '@/sources/types';

interface SourceHealthState {
  /** Last known health per source (from a self-test or a real failure). */
  bySource: Partial<Record<SourceId, SourceHealth>>;
  set: (id: SourceId, health: SourceHealth) => void;
}

/** Written by source adapters; read by Settings. */
export const useSourceHealthStore = create<SourceHealthState>()(
  persist(
    (set) => ({
      bySource: {},
      set: (id, health) => set((s) => ({ bySource: { ...s.bySource, [id]: health } })),
    }),
    {
      name: 'soniq:source-health',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ bySource: s.bySource }),
      version: 1,
    },
  ),
);
