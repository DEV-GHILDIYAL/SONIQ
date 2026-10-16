import type { Track } from '@/sources/types';

export const makeTrack = (n: number, overrides: Partial<Track> = {}): Track => ({
  id: `jamendo:${n}`,
  title: `Track ${n}`,
  artist: `Artist ${n}`,
  durationSec: 125,
  source: 'jamendo',
  ...overrides,
});
