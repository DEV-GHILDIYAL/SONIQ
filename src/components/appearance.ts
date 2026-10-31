/**
 * Appearance: colour themes and app fonts (free for everyone, Settings > Theme & font).
 * Themes override a few palette tokens on top of the base dark / light palettes.
 * Fonts swap the family of every `type.*` text style (see applyFont in theme.ts).
 */
import type { Palette } from './theme';

export type AppThemeId =
  | 'classic'
  | 'ocean'
  | 'rose'
  | 'forest'
  | 'violet'
  | 'teal'
  | 'crimson'
  | 'gold'
  | 'lavender'
  | 'neon'
  | 'mocha'
  | 'amoled';

export interface AppTheme {
  id: AppThemeId;
  name: string;
  /** Short line under the name. */
  vibe: string;
  dark: Partial<Palette>;
  light: Partial<Palette>;
}

export const APP_THEMES: readonly AppTheme[] = [
  { id: 'classic', name: 'Amber', vibe: 'Warm and classic', dark: {}, light: {} },
  {
    id: 'ocean',
    name: 'Ocean',
    vibe: 'Cool late-night blue',
    dark: { accent: '#4DA3FF', accentSoft: '#13283F', onAccent: '#06121F' },
    light: { accent: '#1F6FD1', accentSoft: '#DCEBFF', onAccent: '#FFFFFF' },
  },
  {
    id: 'rose',
    name: 'Rose',
    vibe: 'Soft and romantic',
    dark: { accent: '#FF6B9A', accentSoft: '#3D1826', onAccent: '#24060F' },
    light: { accent: '#D6336C', accentSoft: '#FCE3EC', onAccent: '#FFFFFF' },
  },
  {
    id: 'forest',
    name: 'Forest',
    vibe: 'Fresh and calm',
    dark: { accent: '#4CD787', accentSoft: '#123222', onAccent: '#04170C' },
    light: { accent: '#1E9E5A', accentSoft: '#DDF5E7', onAccent: '#FFFFFF' },
  },
  {
    id: 'violet',
    name: 'Violet',
    vibe: 'Dreamy and bold',
    dark: { accent: '#A78BFA', accentSoft: '#261C45', onAccent: '#140B2E' },
    light: { accent: '#7C4DFF', accentSoft: '#ECE5FF', onAccent: '#FFFFFF' },
  },
  {
    id: 'teal',
    name: 'Teal',
    vibe: 'Cool and focused',
    dark: { accent: '#2DD4BF', accentSoft: '#0F302C', onAccent: '#03201C' },
    light: { accent: '#0F9488', accentSoft: '#D5F5F1', onAccent: '#FFFFFF' },
  },
  {
    id: 'crimson',
    name: 'Crimson',
    vibe: 'Loud and fiery',
    dark: { accent: '#FF4D5E', accentSoft: '#3D1418', onAccent: '#260509' },
    light: { accent: '#D11F35', accentSoft: '#FCDDE1', onAccent: '#FFFFFF' },
  },
  {
    id: 'gold',
    name: 'Gold',
    vibe: 'Rich and royal',
    dark: { accent: '#F5C542', accentSoft: '#3A2F10', onAccent: '#211903' },
    light: { accent: '#B88A06', accentSoft: '#FBF0CF', onAccent: '#FFFFFF' },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    vibe: 'Pastel and gentle',
    dark: { accent: '#C4B5FD', accentSoft: '#2C2547', onAccent: '#1A1433' },
    light: { accent: '#8B6FD6', accentSoft: '#EFEAFD', onAccent: '#FFFFFF' },
  },
  {
    id: 'neon',
    name: 'Neon',
    vibe: 'Electric lime',
    dark: { accent: '#C6FF3D', accentSoft: '#26330A', onAccent: '#121A00' },
    light: { accent: '#5E9E00', accentSoft: '#EAF7D2', onAccent: '#FFFFFF' },
  },
  {
    id: 'mocha',
    name: 'Mocha',
    vibe: 'Coffee-shop cosy',
    dark: {
      accent: '#D4A373',
      accentSoft: '#3A2A1E',
      onAccent: '#1F140B',
      background: '#17120E',
      surface: '#221B15',
      surfaceHigh: '#2E251D',
      surfacePressed: '#382D23',
      border: '#30271F',
      searchField: '#221B15',
    },
    light: { accent: '#9C6B3F', accentSoft: '#F3E6D8', onAccent: '#FFFFFF', background: '#F8F1E9' },
  },
  {
    id: 'amoled',
    name: 'Pure Black',
    vibe: 'True black, saves battery',
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

export type AppFontId =
  'system' | 'poppins' | 'grotesk' | 'nunito' | 'montserrat' | 'outfit' | 'quicksand' | 'playfair';
export type FontWeightKey = 'medium' | 'bold' | 'heavy';

export interface AppFont {
  id: AppFontId;
  name: string;
  vibe: string;
  /** Family names registered with expo-font, per weight. Empty for the system font. */
  families: Partial<Record<FontWeightKey, string>>;
}

export const APP_FONTS: readonly AppFont[] = [
  { id: 'system', name: 'Default', vibe: 'Your phone’s font', families: {} },
  {
    id: 'poppins',
    name: 'Poppins',
    vibe: 'Round and friendly',
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
    families: { medium: 'Nunito_500Medium', bold: 'Nunito_700Bold', heavy: 'Nunito_800ExtraBold' },
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    vibe: 'Clean and bold',
    families: {
      medium: 'Montserrat_500Medium',
      bold: 'Montserrat_700Bold',
      heavy: 'Montserrat_800ExtraBold',
    },
  },
  {
    id: 'outfit',
    name: 'Outfit',
    vibe: 'Modern and minimal',
    families: { medium: 'Outfit_500Medium', bold: 'Outfit_700Bold', heavy: 'Outfit_800ExtraBold' },
  },
  {
    id: 'quicksand',
    name: 'Quicksand',
    vibe: 'Light and bubbly',
    families: {
      medium: 'Quicksand_500Medium',
      bold: 'Quicksand_700Bold',
      heavy: 'Quicksand_700Bold',
    },
  },
  {
    id: 'playfair',
    name: 'Playfair',
    vibe: 'Elegant serif',
    families: {
      medium: 'PlayfairDisplay_500Medium',
      bold: 'PlayfairDisplay_700Bold',
      heavy: 'PlayfairDisplay_800ExtraBold',
    },
  },
];

export const fontById = (id: string | undefined): AppFont =>
  APP_FONTS.find((f) => f.id === id) ?? (APP_FONTS[0] as AppFont);

/**
 * Font files for expo-font. Only the weights SONIQ uses are bundled
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
    case 'montserrat':
      return {
        Montserrat_500Medium:
          require('@expo-google-fonts/montserrat/500Medium/Montserrat_500Medium.ttf') as number,
        Montserrat_700Bold:
          require('@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf') as number,
        Montserrat_800ExtraBold:
          require('@expo-google-fonts/montserrat/800ExtraBold/Montserrat_800ExtraBold.ttf') as number,
      };
    case 'outfit':
      return {
        Outfit_500Medium:
          require('@expo-google-fonts/outfit/500Medium/Outfit_500Medium.ttf') as number,
        Outfit_700Bold: require('@expo-google-fonts/outfit/700Bold/Outfit_700Bold.ttf') as number,
        Outfit_800ExtraBold:
          require('@expo-google-fonts/outfit/800ExtraBold/Outfit_800ExtraBold.ttf') as number,
      };
    case 'quicksand':
      return {
        Quicksand_500Medium:
          require('@expo-google-fonts/quicksand/500Medium/Quicksand_500Medium.ttf') as number,
        Quicksand_700Bold:
          require('@expo-google-fonts/quicksand/700Bold/Quicksand_700Bold.ttf') as number,
      };
    case 'playfair':
      return {
        PlayfairDisplay_500Medium:
          require('@expo-google-fonts/playfair-display/500Medium/PlayfairDisplay_500Medium.ttf') as number,
        PlayfairDisplay_700Bold:
          require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf') as number,
        PlayfairDisplay_800ExtraBold:
          require('@expo-google-fonts/playfair-display/800ExtraBold/PlayfairDisplay_800ExtraBold.ttf') as number,
      };
    default:
      return {};
  }
}

/** Where to go after the app re-mounts for a font switch (set by the Appearance screen). */
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
