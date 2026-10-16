import { useColorScheme } from 'react-native';

/**
 * SONIQ design tokens: warm charcoal + amber accent. Calm, neutral surfaces;
 * colour comes from artwork and one accent. Dark is primary; light is warm cream.
 */
export const palettes = {
  dark: {
    background: '#121110',
    surface: '#1E1C1A',
    surfaceHigh: '#2A2725',
    surfacePressed: '#34302D',
    border: '#2E2A27',
    text: '#F5F1EA',
    textMuted: '#9C958C',
    textFaint: '#6B655E',
    accent: '#FF8A3D',
    accentSoft: '#3A2618',
    onAccent: '#1A0F06',
    danger: '#FF6A5C',
    searchField: '#1E1C1A',
    onSearchField: '#F5F1EA',
    placeholder: '#8A847C',
  },
  light: {
    background: '#FAF7F2',
    surface: '#FFFFFF',
    surfaceHigh: '#F0EBE3',
    surfacePressed: '#E6DFD5',
    border: '#E8E1D7',
    text: '#1A1714',
    textMuted: '#6E665D',
    textFaint: '#A39A8F',
    accent: '#E8691F',
    accentSoft: '#FCE6D6',
    onAccent: '#FFFFFF',
    danger: '#D2402F',
    searchField: '#FFFFFF',
    onSearchField: '#1A1714',
    placeholder: '#A39A8F',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['dark']]: string };

/** `page` is the single horizontal gutter every screen uses, so edges line up everywhere. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, page: 20, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const type = {
  display: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' },
  bodyStrong: { fontSize: 15, fontWeight: '700' },
  caption: { fontSize: 13, fontWeight: '500' },
  micro: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
} as const;

/** Docked tab bar height (safe-area inset is added below it). */
export const TAB_BAR_HEIGHT = 64;
/** Height of the mini player that sits right above the tab bar. */
export const MINI_PLAYER_HEIGHT = 60;

/** Bottom padding for scrollable tab screens so the last row clears the mini player. */
export const CONTENT_BOTTOM_PADDING = MINI_PLAYER_HEIGHT + spacing.xl;

/** Warm, earthy tile colours (genre tiles, artwork fallbacks). Text on them is always white. */
export const tileColors = [
  '#B5532C',
  '#B9822A',
  '#6E7A3C',
  '#8E3A2F',
  '#A0653C',
  '#5D6A4F',
  '#9A4858',
  '#7B5A3A',
  '#C0704A',
  '#4E6359',
] as const;

/** Stable colour for an id, so the same track/playlist always gets the same tile colour. */
export function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return tileColors[Math.abs(hash) % tileColors.length] ?? tileColors[0];
}

/** "#RRGGBB" + alpha (0..1) -> "rgba(...)". */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export interface Theme {
  scheme: 'dark' | 'light';
  colors: Palette;
}

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  return { scheme, colors: palettes[scheme] };
}
