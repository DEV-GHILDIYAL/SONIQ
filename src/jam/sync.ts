/** Pure Jam sync helpers (no I/O): codes, clock offset, expected position, drift. */
import type { Track } from '@/sources/types';

/** What the host broadcasts. `sentAt` is in the host's clock (ms). */
export interface JamState {
  track: Track | null;
  positionSec: number;
  playing: boolean;
  sentAt: number;
  /** Next tracks in the host's queue (for display and for the guest's queue). */
  upNext: Track[];
  /** Host's visibility setting (guests mirror it). Missing in old builds = private. */
  isPublic?: boolean;
  /** What guests may do. Missing in old builds = add songs. */
  guestMode?: 'listen' | 'add' | 'control';
  /** Who added which upcoming track (track id → name). */
  upNextBy?: Record<string, string>;
}

/** Guests re-seek when they drift further than this from the host. */
export const DRIFT_TOLERANCE_SEC = 1.5;

// No 0/O/1/I: easy to read out loud and type.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function makeJamCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)] ?? 'A';
  }
  return code;
}

/** "ab c-12x9" -> "ABC12X9" (uppercase, letters and digits only). */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface PingSample {
  /** Local time the ping was sent. */
  sentAt: number;
  /** Host time when it answered. */
  hostTime: number;
  /** Local time the pong arrived. */
  receivedAt: number;
}

/**
 * Host clock minus local clock (ms), from the ping with the smallest round trip
 * (least network jitter). 0 when there are no samples.
 */
export function clockOffset(samples: readonly PingSample[]): number {
  let best: PingSample | null = null;
  for (const s of samples) {
    if (!best || s.receivedAt - s.sentAt < best.receivedAt - best.sentAt) best = s;
  }
  if (!best) return 0;
  return best.hostTime - (best.sentAt + best.receivedAt) / 2;
}

/** Where the host is now (seconds), given the host's current clock. */
export function expectedPosition(state: JamState, hostNow: number): number {
  if (!state.playing) return state.positionSec;
  return state.positionSec + Math.max(0, hostNow - state.sentAt) / 1000;
}

export function needsSeek(localSec: number, expectedSec: number): boolean {
  return Math.abs(localSec - expectedSec) > DRIFT_TOLERANCE_SEC;
}
