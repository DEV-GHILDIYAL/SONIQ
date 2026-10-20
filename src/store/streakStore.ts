import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** A day counts once the user has really listened to a song (at least this long). */
export const STREAK_MIN_LISTEN_SEC = 30;

/** "2026-10-18" in the phone's local time zone. */
export function dayKey(d: Date = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d + delta));
}

interface StreakState {
  /** Days in a row ending at lastDay. */
  current: number;
  best: number;
  lastDay: string | null;
  /** Recent listening days (newest first, max 60) for the week view. */
  days: string[];
  /** Set when the streak grows, to show a small celebration. */
  celebrate: number | null;
  /** Count today as a listening day. Returns true if the streak grew. */
  markListened: (today?: string) => boolean;
  clearCelebrate: () => void;
}

export const useStreakStore = create<StreakState>()(
  persist(
    (set, get) => ({
      current: 0,
      best: 0,
      lastDay: null,
      days: [],
      celebrate: null,
      markListened: (today = dayKey()) => {
        const s = get();
        if (s.lastDay === today) return false;
        const current = s.lastDay === addDays(today, -1) ? s.current + 1 : 1;
        set({
          current,
          best: Math.max(s.best, current),
          lastDay: today,
          days: [today, ...s.days.filter((d) => d !== today)].slice(0, 60),
          celebrate: current,
        });
        return true;
      },
      clearCelebrate: () => set({ celebrate: null }),
    }),
    {
      name: 'soniq:streak',
      storage: createJSONStorage(() => appStorage),
      partialize: ({ current, best, lastDay, days }) => ({ current, best, lastDay, days }),
      version: 1,
    },
  ),
);

/** Streak as of today: 0 if the user missed yesterday and hasn't listened today. */
export function liveStreak(s: Pick<StreakState, 'current' | 'lastDay'>, today: string = dayKey()): number {
  if (s.lastDay === today || s.lastDay === addDays(today, -1)) return s.current;
  return 0;
}

/** True when the streak is alive but today isn't done yet. */
export const streakAtRisk = (s: Pick<StreakState, 'current' | 'lastDay'>, today: string = dayKey()) =>
  s.current > 0 && s.lastDay === addDays(today, -1);

/** Last 7 days, oldest first, with whether the user listened that day. */
export function lastWeek(days: readonly string[], today: string = dayKey()): { key: string; label: string; done: boolean }[] {
  const set = new Set(days);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(today, i - 6);
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    const label = new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'narrow' });
    return { key, label, done: set.has(key) };
  });
}
