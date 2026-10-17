import {
  cancelSleepTimer,
  FADE_SEC,
  MAX_WAIT_SEC,
  sleepAtEndOfTrack,
  sleepDecision,
  sleepDue,
  startSleepTimer,
  useSleepStore,
  type SleepState,
} from './sleep';

const off: SleepState = { endsAt: null, endOfTrack: false, fadeStartedAt: null };

afterEach(cancelSleepTimer);

describe('sleep timer', () => {
  it('does nothing until due', () => {
    expect(sleepDecision(off, 0, 3)).toEqual({ volume: 1, stopNow: false, startFade: false });
    const s = { ...off, endsAt: 10_000 };
    expect(sleepDue(s, 9_999)).toBe(false);
    expect(sleepDecision(s, 9_999, 3).volume).toBe(1);
  });

  it('when due, lets the song finish and fades over its last seconds', () => {
    const s = { ...off, endsAt: 1 };
    expect(sleepDecision(s, 5, 60).volume).toBe(1);
    expect(sleepDecision(s, 5, FADE_SEC / 2).volume).toBeCloseTo(0.5);
    expect(sleepDecision(s, 5, 0).volume).toBe(0);
  });

  it('fades out right away when too much of the song is left', () => {
    const s = { ...off, endsAt: 1 };
    expect(sleepDecision(s, 5, MAX_WAIT_SEC + 1).startFade).toBe(true);
    const fading = { ...s, fadeStartedAt: 1_000 };
    expect(sleepDecision(fading, 1_000 + (FADE_SEC * 1000) / 2, 999).volume).toBeCloseTo(0.5);
    expect(sleepDecision(fading, 1_000 + FADE_SEC * 1000, 999).stopNow).toBe(true);
  });

  it('sets and clears the store', () => {
    startSleepTimer(30, 1_000);
    expect(useSleepStore.getState().endsAt).toBe(1_000 + 30 * 60_000);
    sleepAtEndOfTrack();
    expect(useSleepStore.getState()).toMatchObject({ endsAt: null, endOfTrack: true });
    cancelSleepTimer();
    expect(useSleepStore.getState()).toEqual(off);
  });
});
