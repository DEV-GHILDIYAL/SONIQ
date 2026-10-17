/**
 * Sleep timer state + the pure fade/stop decision. The engine applies it
 * (only the engine touches audio).
 *
 * When the timer is due we don't cut the song: it fades out over the last
 * FADE_SEC of the current track and playback stops instead of moving on.
 * If more than MAX_WAIT_SEC of the song is left, we fade out right away.
 */
import { create } from 'zustand';

export const FADE_SEC = 8;
export const MAX_WAIT_SEC = 5 * 60;

export interface SleepState {
  /** Epoch ms when the timer is due, or null. */
  endsAt: number | null;
  /** "Stop after this song" mode. */
  endOfTrack: boolean;
  /** Set when a forced fade (song too long to wait for) started. */
  fadeStartedAt: number | null;
}

export const useSleepStore = create<SleepState>(() => ({
  endsAt: null,
  endOfTrack: false,
  fadeStartedAt: null,
}));

export const sleepActive = (s: SleepState) => s.endsAt !== null || s.endOfTrack;

/** True once the timer wants playback to stop at the end of the current song. */
export const sleepDue = (s: SleepState, now: number) =>
  s.endOfTrack || (s.endsAt !== null && now >= s.endsAt);

export interface SleepDecision {
  volume: number;
  /** Stop playback now (forced fade finished). */
  stopNow: boolean;
  /** Start a forced fade now (engine stores `now` as fadeStartedAt). */
  startFade: boolean;
}

export function sleepDecision(s: SleepState, now: number, remainingSec: number): SleepDecision {
  if (!sleepDue(s, now)) return { volume: 1, stopNow: false, startFade: false };
  if (s.fadeStartedAt !== null) {
    const v = 1 - (now - s.fadeStartedAt) / (FADE_SEC * 1000);
    return { volume: Math.max(0, Math.min(1, v)), stopNow: v <= 0, startFade: false };
  }
  if (remainingSec > MAX_WAIT_SEC) return { volume: 1, stopNow: false, startFade: true };
  return { volume: Math.max(0, Math.min(1, remainingSec / FADE_SEC)), stopNow: false, startFade: false };
}

let dueTimer: ReturnType<typeof setTimeout> | null = null;
let onDue: (() => void) | null = null;

/** The engine registers what to do when the timer is due while paused. */
export function setSleepDueHandler(fn: (() => void) | null): void {
  onDue = fn;
}

function clearDueTimer() {
  if (dueTimer) clearTimeout(dueTimer);
  dueTimer = null;
}

export function startSleepTimer(minutes: number, now = Date.now()): void {
  clearDueTimer();
  const endsAt = now + minutes * 60_000;
  useSleepStore.setState({ endsAt, endOfTrack: false, fadeStartedAt: null });
  dueTimer = setTimeout(() => onDue?.(), endsAt - now);
}

export function sleepAtEndOfTrack(): void {
  clearDueTimer();
  useSleepStore.setState({ endsAt: null, endOfTrack: true, fadeStartedAt: null });
}

export function cancelSleepTimer(): void {
  clearDueTimer();
  useSleepStore.setState({ endsAt: null, endOfTrack: false, fadeStartedAt: null });
}
