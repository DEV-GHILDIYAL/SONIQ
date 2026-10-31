import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '@/lib/appStorage';

export type DjSegmentKind = 'favourites' | 'discover' | 'throwback' | 'mood';

interface DjState {
  active: boolean;
  /** What's playing now (shown on the player). */
  segment: { kind: DjSegmentKind; label: string } | null;
  /** Building the next set (Switch it up / start). */
  busy: boolean;
  /** DJ talks between sets (off = music only). */
  voice: boolean;
  toggleVoice: () => void;
}

export const useDjStore = create<DjState>()(
  persist(
    (set) => ({
      active: false,
      segment: null,
      busy: false,
      voice: true,
      toggleVoice: () => set((s) => ({ voice: !s.voice })),
    }),
    {
      name: 'soniq:dj',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ voice: s.voice }),
      version: 1,
    },
  ),
);
