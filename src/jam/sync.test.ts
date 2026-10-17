import {
  clockOffset,
  expectedPosition,
  makeJamCode,
  needsSeek,
  normalizeCode,
  type JamState,
} from './sync';

const state = (over: Partial<JamState> = {}): JamState => ({
  track: null,
  positionSec: 30,
  playing: true,
  sentAt: 1_000_000,
  upNext: [],
  ...over,
});

describe('jam sync', () => {
  it('makes 6-char codes without look-alike characters', () => {
    const code = makeJamCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('normalizes typed codes', () => {
    expect(normalizeCode(' ab-c 12x ')).toBe('ABC12X');
  });

  it('adds elapsed host time while playing, not while paused', () => {
    expect(expectedPosition(state(), 1_002_500)).toBeCloseTo(32.5);
    expect(expectedPosition(state({ playing: false }), 1_002_500)).toBe(30);
    expect(expectedPosition(state(), 999_000)).toBe(30); // never goes backwards
  });

  it('estimates clock offset from the cleanest ping', () => {
    const offset = clockOffset([
      { sentAt: 0, hostTime: 5_400, receivedAt: 800 }, // slow, noisy
      { sentAt: 1_000, hostTime: 6_050, receivedAt: 1_100 }, // rtt 100 -> offset 5000
    ]);
    expect(offset).toBe(5_000);
    expect(clockOffset([])).toBe(0);
  });

  it('only re-seeks on real drift', () => {
    expect(needsSeek(30, 31)).toBe(false);
    expect(needsSeek(30, 32)).toBe(true);
  });
});
