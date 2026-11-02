import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppFontId, AppThemeId, CustomBackground } from '@/components/appearance';

export type ThemeMode = 'system' | 'light' | 'dark';
/** Text size multiplier (Settings › Colours & font). */
export type TextScale = 0.9 | 1 | 1.12 | 1.25;
/** Full player background: blurred artwork, plain theme colour, or artwork colour gradient. */
export type PlayerBackground = 'blur' | 'solid' | 'gradient';

interface SettingsState {
  /** Keep playing similar songs when the queue ends (Spotify-style radio). */
  autoplay: boolean;
  toggleAutoplay: () => void;
  /** App theme; "system" follows the phone's dark/light setting. */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** Light vibration on play/pause, skip, like and long-press. */
  haptics: boolean;
  toggleHaptics: () => void;
  /** Colour theme and app font (Settings › Colours & font). */
  appTheme: AppThemeId;
  setAppTheme: (id: AppThemeId) => void;
  appFont: AppFontId;
  setAppFont: (id: AppFontId) => void;
  /** "My theme": accent colour and background style. */
  customAccent: string;
  customBg: CustomBackground;
  setCustomTheme: (accent: string, bg: CustomBackground) => void;
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
  playerBackground: PlayerBackground;
  setPlayerBackground: (bg: PlayerBackground) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoplay: true,
      toggleAutoplay: () => set((s) => ({ autoplay: !s.autoplay })),
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),
      haptics: true,
      toggleHaptics: () => set((s) => ({ haptics: !s.haptics })),
      appTheme: 'classic',
      setAppTheme: (appTheme) => set({ appTheme }),
      appFont: 'system',
      setAppFont: (appFont) => set({ appFont }),
      customAccent: '#FF4FA3',
      customBg: 'dark',
      setCustomTheme: (customAccent, customBg) =>
        set({ customAccent, customBg, appTheme: 'custom' }),
      textScale: 1,
      setTextScale: (textScale) => set({ textScale }),
      playerBackground: 'blur',
      setPlayerBackground: (playerBackground) => set({ playerBackground }),
    }),
    {
      name: 'soniq:settings',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({
        autoplay: s.autoplay,
        themeMode: s.themeMode,
        haptics: s.haptics,
        appTheme: s.appTheme,
        appFont: s.appFont,
        customAccent: s.customAccent,
        customBg: s.customBg,
        textScale: s.textScale,
        playerBackground: s.playerBackground,
      }),
      version: 1,
    },
  ),
);
