import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '@/lib/appStorage';

export type NotifyKind = 'daily' | 'recap' | 'streak' | 'comeback' | 'downloads';

interface NotifyState {
  /** Master switch: on only after the user allowed notifications. */
  enabled: boolean;
  kinds: Record<NotifyKind, boolean>;
  /** Hour (0-23) for reminders, or null = learn it from when the user listens. */
  hour: number | null;
  /** The "want notifications?" card was answered (don't ask again). */
  asked: boolean;
  setEnabled: (on: boolean) => void;
  toggleKind: (kind: NotifyKind) => void;
  setHour: (hour: number | null) => void;
  setAsked: () => void;
}

export const useNotifyStore = create<NotifyState>()(
  persist(
    (set) => ({
      enabled: false,
      kinds: { daily: true, recap: true, streak: true, comeback: true, downloads: true },
      hour: null,
      asked: false,
      setEnabled: (enabled) => set({ enabled }),
      toggleKind: (kind) => set((s) => ({ kinds: { ...s.kinds, [kind]: !s.kinds[kind] } })),
      setHour: (hour) => set({ hour }),
      setAsked: () => set({ asked: true }),
    }),
    {
      name: 'soniq:notify',
      storage: createJSONStorage(() => appStorage),
      partialize: ({ enabled, kinds, hour, asked }) => ({ enabled, kinds, hour, asked }),
      version: 1,
    },
  ),
);
