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
  | 'amoled'
  | 'diwali'
  | 'holi'
  | 'monsoon'
  | 'mumbai'
  | 'sunset'
  | 'mint'
  | 'chai'
  | 'royal'
  | 'custom';

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
  {
    id: 'diwali',
    name: 'Diwali',
    vibe: 'Diya gold on deep maroon',
    dark: {
      accent: '#FFB627',
      accentSoft: '#4A2410',
      onAccent: '#2A1200',
      background: '#1A0A0C',
      surface: '#2A1215',
      surfaceHigh: '#38191C',
      surfacePressed: '#432024',
      border: '#3A1A1D',
      searchField: '#2A1215',
    },
    light: { accent: '#C2410C', accentSoft: '#FDE7CF', onAccent: '#FFFFFF', background: '#FFF6EA' },
  },
  {
    id: 'holi',
    name: 'Holi',
    vibe: 'Gulaal pink and colour',
    dark: {
      accent: '#FF4FA3',
      accentSoft: '#3E1430',
      onAccent: '#2A0018',
      background: '#140F1E',
      surface: '#211A30',
      surfaceHigh: '#2C2340',
      surfacePressed: '#352B4C',
      border: '#2C2340',
      searchField: '#211A30',
    },
    light: { accent: '#E0267D', accentSoft: '#FFE0F0', onAccent: '#FFFFFF', background: '#FFF7FB' },
  },
  {
    id: 'monsoon',
    name: 'Monsoon',
    vibe: 'Rainy grey-blue',
    dark: {
      accent: '#7FB8D8',
      accentSoft: '#1B2E3A',
      onAccent: '#061620',
      background: '#0F1519',
      surface: '#182127',
      surfaceHigh: '#212C33',
      surfacePressed: '#29363E',
      border: '#223038',
      searchField: '#182127',
    },
    light: { accent: '#2F7EA8', accentSoft: '#DDEEF7', onAccent: '#FFFFFF', background: '#F3F7F9' },
  },
  {
    id: 'mumbai',
    name: 'Neon Mumbai',
    vibe: 'Marine Drive at midnight',
    dark: {
      accent: '#00E5FF',
      accentSoft: '#0E2F3A',
      onAccent: '#001A20',
      background: '#07070F',
      surface: '#11111F',
      surfaceHigh: '#1B1B2E',
      surfacePressed: '#25253C',
      border: '#1B1B2E',
      searchField: '#11111F',
    },
    light: { accent: '#0095B3', accentSoft: '#D6F6FC', onAccent: '#FFFFFF' },
  },
  {
    id: 'sunset',
    name: 'Sunset Goa',
    vibe: 'Beach-shack coral',
    dark: {
      accent: '#FF7A59',
      accentSoft: '#3E1E17',
      onAccent: '#260B05',
      background: '#1A1012',
      surface: '#27191B',
      surfaceHigh: '#332225',
      surfacePressed: '#3D2A2D',
      border: '#352427',
      searchField: '#27191B',
    },
    light: { accent: '#E5532F', accentSoft: '#FFE4DB', onAccent: '#FFFFFF', background: '#FFF7F2' },
  },
  {
    id: 'mint',
    name: 'Mint',
    vibe: 'Cool and fresh',
    dark: { accent: '#7CF2C4', accentSoft: '#143A2E', onAccent: '#022118' },
    light: { accent: '#14A877', accentSoft: '#D9F7EC', onAccent: '#FFFFFF' },
  },
  {
    id: 'chai',
    name: 'Cutting Chai',
    vibe: 'Masala chai brown',
    dark: {
      accent: '#E0A458',
      accentSoft: '#3D2B17',
      onAccent: '#211405',
      background: '#16110C',
      surface: '#211A13',
      surfaceHigh: '#2D241A',
      surfacePressed: '#372C21',
      border: '#2E251B',
      searchField: '#211A13',
    },
    light: { accent: '#A86A24', accentSoft: '#F5E6D2', onAccent: '#FFFFFF', background: '#FAF3EA' },
  },
  {
    id: 'royal',
    name: 'Royal Purple',
    vibe: 'Velvet and gold',
    dark: {
      accent: '#E9C46A',
      accentSoft: '#3A2D4A',
      onAccent: '#1F1503',
      background: '#120C1C',
      surface: '#1D152B',
      surfaceHigh: '#281E39',
      surfacePressed: '#312645',
      border: '#2A2040',
      searchField: '#1D152B',
    },
    light: { accent: '#6B3FA0', accentSoft: '#EDE3F8', onAccent: '#FFFFFF', background: '#FAF7FD' },
  },
  { id: 'custom', name: 'My theme', vibe: 'Your colour, your way', dark: {}, light: {} },
];

// ---------- Custom theme ----------

/** Accent choices for "My theme". */
export const CUSTOM_ACCENTS = [
  '#FF8A3D',
  '#FFB627',
  '#F5C542',
  '#C6FF3D',
  '#7CF2C4',
  '#4CD787',
  '#2DD4BF',
  '#00E5FF',
  '#4DA3FF',
  '#5B7CFA',
  '#A78BFA',
  '#C4B5FD',
  '#E879F9',
  '#FF4FA3',
  '#FF6B9A',
  '#FF4D5E',
  '#FF7A59',
  '#E0A458',
  '#D4A373',
  '#B8C0CC',
  '#FFFFFF',
  '#9AE6B4',
  '#FBD38D',
  '#90CDF4',
] as const;

/** dark = SONIQ charcoal, amoled = true black, tint = background tinted with the accent. */
export type CustomBackground = 'dark' | 'amoled' | 'tint';

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Mix `a` toward `b` by `t` (0..1). */
function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Palette overrides for "My theme" from one accent colour and a background style. */
export function customOverrides(
  scheme: 'dark' | 'light',
  accent: string,
  bg: CustomBackground,
): Partial<Palette> {
  const onAccent = luminance(accent) > 0.45 ? '#111111' : '#FFFFFF';
  if (scheme === 'light') {
    const strong = luminance(accent) > 0.5 ? mix(accent, '#000000', 0.35) : accent;
    return {
      accent: strong,
      accentSoft: mix(strong, '#FFFFFF', 0.85),
      onAccent: luminance(strong) > 0.45 ? '#111111' : '#FFFFFF',
      ...(bg === 'tint' ? { background: mix(strong, '#FFFFFF', 0.95) } : {}),
    };
  }
  const base =
    bg === 'amoled' ? '#000000' : bg === 'tint' ? mix(accent, '#0C0C0C', 0.9) : '#121110';
  return {
    accent,
    accentSoft: mix(accent, base, 0.78),
    onAccent,
    background: base,
    surface: mix(base, '#FFFFFF', 0.06),
    surfaceHigh: mix(base, '#FFFFFF', 0.1),
    surfacePressed: mix(base, '#FFFFFF', 0.14),
    border: mix(base, '#FFFFFF', 0.09),
    searchField: mix(base, '#FFFFFF', 0.06),
  };
}

export const themeById = (id: string | undefined): AppTheme =>
  APP_THEMES.find((t) => t.id === id) ?? (APP_THEMES[0] as AppTheme);

export type AppFontId =
  | 'system'
  | 'poppins'
  | 'grotesk'
  | 'nunito'
  | 'montserrat'
  | 'outfit'
  | 'quicksand'
  | 'playfair'
  | 'hind'
  | 'mukta'
  | 'baloo'
  | 'tiro'
  | 'teko'
  | 'righteous';
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
  {
    id: 'hind',
    name: 'Hind',
    vibe: 'Clean Hindi + English',
    families: { medium: 'Hind_500Medium', bold: 'Hind_700Bold', heavy: 'Hind_700Bold' },
  },
  {
    id: 'mukta',
    name: 'Mukta',
    vibe: 'Friendly Hindi + English',
    families: { medium: 'Mukta_500Medium', bold: 'Mukta_700Bold', heavy: 'Mukta_800ExtraBold' },
  },
  {
    id: 'baloo',
    name: 'Baloo 2',
    vibe: 'Bubbly, Bollywood poster',
    families: { medium: 'Baloo2_500Medium', bold: 'Baloo2_700Bold', heavy: 'Baloo2_800ExtraBold' },
  },
  {
    id: 'tiro',
    name: 'Tiro Devanagari',
    vibe: 'Classic Hindi serif',
    families: {
      medium: 'TiroDevanagariHindi_400Regular',
      bold: 'TiroDevanagariHindi_400Regular',
      heavy: 'TiroDevanagariHindi_400Regular',
    },
  },
  {
    id: 'teko',
    name: 'Teko',
    vibe: 'Tall and sporty',
    families: { medium: 'Teko_500Medium', bold: 'Teko_600SemiBold', heavy: 'Teko_700Bold' },
  },
  {
    id: 'righteous',
    name: 'Righteous',
    vibe: 'Retro disco',
    families: {
      medium: 'Righteous_400Regular',
      bold: 'Righteous_400Regular',
      heavy: 'Righteous_400Regular',
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
    case 'hind':
      return {
        Hind_500Medium: require('@expo-google-fonts/hind/500Medium/Hind_500Medium.ttf') as number,
        Hind_700Bold: require('@expo-google-fonts/hind/700Bold/Hind_700Bold.ttf') as number,
      };
    case 'mukta':
      return {
        Mukta_500Medium:
          require('@expo-google-fonts/mukta/500Medium/Mukta_500Medium.ttf') as number,
        Mukta_700Bold: require('@expo-google-fonts/mukta/700Bold/Mukta_700Bold.ttf') as number,
        Mukta_800ExtraBold:
          require('@expo-google-fonts/mukta/800ExtraBold/Mukta_800ExtraBold.ttf') as number,
      };
    case 'baloo':
      return {
        Baloo2_500Medium:
          require('@expo-google-fonts/baloo-2/500Medium/Baloo2_500Medium.ttf') as number,
        Baloo2_700Bold: require('@expo-google-fonts/baloo-2/700Bold/Baloo2_700Bold.ttf') as number,
        Baloo2_800ExtraBold:
          require('@expo-google-fonts/baloo-2/800ExtraBold/Baloo2_800ExtraBold.ttf') as number,
      };
    case 'tiro':
      return {
        TiroDevanagariHindi_400Regular:
          require('@expo-google-fonts/tiro-devanagari-hindi/400Regular/TiroDevanagariHindi_400Regular.ttf') as number,
      };
    case 'teko':
      return {
        Teko_500Medium: require('@expo-google-fonts/teko/500Medium/Teko_500Medium.ttf') as number,
        Teko_600SemiBold:
          require('@expo-google-fonts/teko/600SemiBold/Teko_600SemiBold.ttf') as number,
        Teko_700Bold: require('@expo-google-fonts/teko/700Bold/Teko_700Bold.ttf') as number,
      };
    case 'righteous':
      return {
        Righteous_400Regular:
          require('@expo-google-fonts/righteous/400Regular/Righteous_400Regular.ttf') as number,
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
