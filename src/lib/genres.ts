import type Ionicons from '@expo/vector-icons/Ionicons';

export interface Genre {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** One short line on the card. */
  tag: string;
  /** Card gradient, top-left to bottom-right. White text must stay readable on both. */
  colors: readonly [string, string];
}

/** Genre shortcuts used on Home and Search. Tapping one runs a search for its label. */
export const GENRES: readonly Genre[] = [
  { label: 'Lo-fi', icon: 'cafe', tag: 'Beats to study to', colors: ['#7B5CD6', '#D9608E'] },
  { label: 'Electronic', icon: 'pulse', tag: 'Synths and bass', colors: ['#00A7C4', '#3A3FD8'] },
  { label: 'Rock', icon: 'flash', tag: 'Turn it up', colors: ['#D63A2F', '#3B1414'] },
  { label: 'Jazz', icon: 'musical-notes', tag: 'Smooth and smoky', colors: ['#C7922E', '#5A3519'] },
  { label: 'Classical', icon: 'rose', tag: 'Timeless pieces', colors: ['#8E6FB0', '#2E2550'] },
  { label: 'Hip-hop', icon: 'mic', tag: 'Bars and beats', colors: ['#F2994A', '#B32F5A'] },
  { label: 'Ambient', icon: 'cloud', tag: 'Float away', colors: ['#4F8FB8', '#24405E'] },
  { label: 'Acoustic', icon: 'leaf', tag: 'Unplugged and warm', colors: ['#6FA35A', '#2F5236'] },
  { label: 'Indie', icon: 'sparkles', tag: 'Fresh finds', colors: ['#E0567A', '#6A3FA0'] },
  { label: 'Folk', icon: 'bonfire', tag: 'Stories by the fire', colors: ['#C9763A', '#5C3A22'] },
];
