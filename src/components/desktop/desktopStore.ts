import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '@/lib/appStorage';

export type PanelTab = 'queue' | 'friends';

/** Desktop-only UI state (remembered between launches). */
interface DesktopState {
  /** Right panel (Up next / Friends) open. */
  panelOpen: boolean;
  panelTab: PanelTab;
  togglePanel: () => void;
  showPanel: (tab: PanelTab) => void;
  setPanelTab: (tab: PanelTab) => void;
}

export const useDesktopStore = create<DesktopState>()(
  persist(
    (set) => ({
      panelOpen: true,
      panelTab: 'queue',
      togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
      showPanel: (panelTab) => set({ panelOpen: true, panelTab }),
      setPanelTab: (panelTab) => set({ panelTab }),
    }),
    {
      name: 'soniq:desktop',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ panelOpen: s.panelOpen, panelTab: s.panelTab }),
      version: 1,
    },
  ),
);
