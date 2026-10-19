import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  /** Keep playing similar songs when the queue ends (Spotify-style radio). */
  autoplay: boolean;
  toggleAutoplay: () => void;
  /** App theme; "system" follows the phone's dark/light setting. */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoplay: true,
      toggleAutoplay: () => set((s) => ({ autoplay: !s.autoplay })),
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: 'soniq:settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ autoplay: s.autoplay, themeMode: s.themeMode }),
      version: 1,
    },
  ),
);
