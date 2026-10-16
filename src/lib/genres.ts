import type { Ionicons } from '@expo/vector-icons';

/** Genre shortcuts used on Home and Search. Tapping one runs a search for its label. */
export const GENRES: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Lo-fi', icon: 'cafe' },
  { label: 'Electronic', icon: 'pulse' },
  { label: 'Rock', icon: 'flash' },
  { label: 'Jazz', icon: 'musical-notes' },
  { label: 'Classical', icon: 'rose' },
  { label: 'Hip-hop', icon: 'mic' },
  { label: 'Ambient', icon: 'cloud' },
  { label: 'Acoustic', icon: 'leaf' },
  { label: 'Indie', icon: 'sparkles' },
  { label: 'Folk', icon: 'bonfire' },
];
