import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '@/lib/appStorage';

export type NotifyKind =
  'daily' | 'recap' | 'streak' | 'comeback' | 'downloads' | 'friends' | 'updates';

const DEFAULT_KINDS: Record<NotifyKind, boolean> = {
  daily: true,
  recap: true,
  streak: true,
  comeback: true,
  downloads: true,
  friends: true,
  updates: true,
};

interface NotifyState {
  /** Master switch: on only after the user allowed notifications. */
  enabled: boolean;
  kinds: Record<NotifyKind, boolean>;
  /** Hour (0-23) for reminders, or null = learn it from when the user listens. */
  hour: number | null;
  /** The "want notifications?" card was answered (don't ask again). */
  asked: boolean;
  /** Last app version we sent a "new update" notification for (once per version). */
  updateNotified: string | null;
  setUpdateNotified: (version: string) => void;
  setEnabled: (on: boolean) => void;
  toggleKind: (kind: NotifyKind) => void;
  setHour: (hour: number | null) => void;
  setAsked: () => void;
}

export const useNotifyStore = create<NotifyState>()(
  persist(
    (set) => ({
      enabled: false,
      kinds: DEFAULT_KINDS,
      hour: null,
      asked: false,
      updateNotified: null,
      setUpdateNotified: (version) => set({ updateNotified: version }),
      setEnabled: (enabled) => set({ enabled }),
      toggleKind: (kind) => set((s) => ({ kinds: { ...s.kinds, [kind]: !s.kinds[kind] } })),
      setHour: (hour) => set({ hour }),
      setAsked: () => set({ asked: true }),
    }),
    {
      name: 'soniq:notify',
      storage: createJSONStorage(() => appStorage),
      partialize: ({ enabled, kinds, hour, asked, updateNotified }) => ({
        enabled,
        kinds,
        hour,
        asked,
        updateNotified,
      }),
      version: 2,
      // v1 had no friends / updates switches: add them (on).
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<NotifyState>;
        return { ...p, kinds: { ...DEFAULT_KINDS, ...(p.kinds ?? {}) } } as NotifyState;
      },
    },
  ),
);
