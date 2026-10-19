/**
 * Lets a Jam guest's taps go to the host instead of the local player.
 * The engine asks `intercept()` before every user action (play, pause, next, seek, queue...).
 * The Jam session installs a handler while you're a guest; it returns true when it took the
 * action (sent it to the host, or refused it with a notice). Code that must drive the local
 * player directly (the Jam session following the host) wraps calls in `direct()`.
 */
import type { Track } from '@/sources/types';

export type RemoteAction =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; sec: number }
  | { type: 'play'; track: Track }
  | { type: 'add'; tracks: Track[] }
  | { type: 'playNext'; tracks: Track[] };

type Handler = (action: RemoteAction) => boolean;

let handler: Handler | null = null;
let bypass = 0;

export function setRemoteHandler(next: Handler | null): void {
  handler = next;
}

/** True when the action was taken over (don't run it locally). */
export function intercept(action: RemoteAction): boolean {
  return bypass === 0 && handler !== null && handler(action);
}

/** Run `fn` on the local player, skipping the Jam handler (only its synchronous start counts). */
export function direct<T>(fn: () => T): T {
  bypass++;
  try {
    return fn();
  } finally {
    bypass--;
  }
}
