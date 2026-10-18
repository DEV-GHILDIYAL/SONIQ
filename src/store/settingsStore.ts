import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SettingsState {
  /** Keep playing similar songs when the queue ends (Spotify-style radio). */
  autoplay: boolean;
  toggleAutoplay: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoplay: true,
      toggleAutoplay: () => set((s) => ({ autoplay: !s.autoplay })),
    }),
    {
      name: 'soniq:settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ autoplay: s.autoplay }),
      version: 1,
    },
  ),
);
