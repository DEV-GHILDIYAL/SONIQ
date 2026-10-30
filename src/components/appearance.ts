/**
 * SONIQ Plus appearance: colour themes and app fonts.
 * Themes override a few palette tokens on top of the base dark / light palettes.
 * Fonts swap the family of every `type.*` text style (see applyFont in theme.ts).
 */
import type { Palette } from './theme';

export type AppThemeId = 'classic' | 'ocean' | 'rose' | 'forest' | 'violet' | 'amoled';

export interface AppTheme {
  id: AppThemeId;
  name: string;
  /** Short line under the name. */
  vibe: string;
  plus: boolean;
  dark: Partial<Palette>;
  light: Partial<Palette>;
}

export const APP_THEMES: readonly AppTheme[] = [
  { id: 'classic', name: 'Amber', vibe: 'Warm and classic', plus: false, dark: {}, light: {} },
  {
    id: 'ocean',
    name: 'Ocean',
    vibe: 'Cool late-night blue',
    plus: true,
    dark: { accent: '#4DA3FF', accentSoft: '#13283F', onAccent: '#06121F' },
    light: { accent: '#1F6FD1', accentSoft: '#DCEBFF', onAccent: '#FFFFFF' },
  },
  {
    id: 'rose',
    name: 'Rose',
    vibe: 'Soft and romantic',
    plus: true,
    dark: { accent: '#FF6B9A', accentSoft: '#3D1826', onAccent: '#24060F' },
    light: { accent: '#D6336C', accentSoft: '#FCE3EC', onAccent: '#FFFFFF' },
  },
  {
    id: 'forest',
    name: 'Forest',
    vibe: 'Fresh and calm',
    plus: true,
    dark: { accent: '#4CD787', accentSoft: '#123222', onAccent: '#04170C' },
    light: { accent: '#1E9E5A', accentSoft: '#DDF5E7', onAccent: '#FFFFFF' },
  },
  {
    id: 'violet',
    name: 'Violet',
    vibe: 'Dreamy and bold',
    plus: true,
    dark: { accent: '#A78BFA', accentSoft: '#261C45', onAccent: '#140B2E' },
    light: { accent: '#7C4DFF', accentSoft: '#ECE5FF', onAccent: '#FFFFFF' },
  },
  {
    id: 'amoled',
    name: 'Pure Black',
    vibe: 'True black, saves battery',
    plus: true,
    dark: {
      background: '#000000',
      surface: '#0E0E0E',
      surfaceHigh: '#1A1A1A',
      surfacePressed: '#242424',
      border: '#1C1C1C',
      searchField: '#0E0E0E',
    },
    light: {},
  },
];

export const themeById = (id: string | undefined): AppTheme =>
  APP_THEMES.find((t) => t.id === id) ?? (APP_THEMES[0] as AppTheme);

export type AppFontId = 'system' | 'poppins' | 'grotesk' | 'nunito';
export type FontWeightKey = 'medium' | 'bold' | 'heavy';

export interface AppFont {
  id: AppFontId;
  name: string;
  vibe: string;
  plus: boolean;
  /** Family names registered with expo-font, per weight. Empty for the system font. */
  families: Partial<Record<FontWeightKey, string>>;
}

export const APP_FONTS: readonly AppFont[] = [
  { id: 'system', name: 'Default', vibe: 'Your phone’s font', plus: false, families: {} },
  {
    id: 'poppins',
    name: 'Poppins',
    vibe: 'Round and friendly',
    plus: true,
    families: {
      medium: 'Poppins_500Medium',
      bold: 'Poppins_700Bold',
      heavy: 'Poppins_800ExtraBold',
    },
  },
  {
    id: 'grotesk',
    name: 'Space Grotesk',
    vibe: 'Techy and sharp',
    plus: true,
    families: {
      medium: 'SpaceGrotesk_500Medium',
      bold: 'SpaceGrotesk_700Bold',
      heavy: 'SpaceGrotesk_700Bold',
    },
  },
  {
    id: 'nunito',
    name: 'Nunito',
    vibe: 'Soft and cute',
    plus: true,
    families: { medium: 'Nunito_500Medium', bold: 'Nunito_700Bold', heavy: 'Nunito_800ExtraBold' },
  },
];

export const fontById = (id: string | undefined): AppFont =>
  APP_FONTS.find((f) => f.id === id) ?? (APP_FONTS[0] as AppFont);

/**
 * Font files for expo-font. Only the three weights SONIQ uses are bundled
 * (deep imports: the package index would pull in every weight).
 */
export function fontFiles(id: AppFontId): Record<string, number> {
  switch (id) {
    case 'poppins':
      return {
        Poppins_500Medium:
          require('@expo-google-fonts/poppins/500Medium/Poppins_500Medium.ttf') as number,
        Poppins_700Bold:
          require('@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf') as number,
        Poppins_800ExtraBold:
          require('@expo-google-fonts/poppins/800ExtraBold/Poppins_800ExtraBold.ttf') as number,
      };
    case 'grotesk':
      return {
        SpaceGrotesk_500Medium:
          require('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf') as number,
        SpaceGrotesk_700Bold:
          require('@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf') as number,
      };
    case 'nunito':
      return {
        Nunito_500Medium:
          require('@expo-google-fonts/nunito/500Medium/Nunito_500Medium.ttf') as number,
        Nunito_700Bold: require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf') as number,
        Nunito_800ExtraBold:
          require('@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf') as number,
      };
    default:
      return {};
  }
}

/** Where to go after the app re-mounts for a font switch (set by the Plus screen). */
let returnAfterFontSwitch: string | null = null;

export function returnHereAfterFontSwitch(path: string): void {
  returnAfterFontSwitch = path;
}

/** Read once by the root layout after the re-mount. */
export function takeFontSwitchReturn(): string | null {
  const path = returnAfterFontSwitch;
  returnAfterFontSwitch = null;
  return path;
}
