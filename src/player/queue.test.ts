import type { Track } from '@/sources/types';
import {
  addToQueue,
  clearUpcoming,
  createQueue,
  currentTrack,
  emptyQueue,
  enqueue,
  hasNext,
  hasPrev,
  moveNext,
  movePrev,
  moveTrack,
  nextPosition,
  playNext,
  prevPosition,
  removeAt,
  selectTrack,
  shuffleQueue,
  unshuffleQueue,
} from './queue';

const t = (n: number): Track => ({
  id: `jamendo:${n}`,
  title: `Track ${n}`,
  artist: 'Artist',
  durationSec: 100,
  source: 'jamendo',
});

describe('queue', () => {
  it('creates an empty queue from an empty list', () => {
    expect(createQueue([])).toBe(emptyQueue);
    expect(currentTrack(emptyQueue)).toBeUndefined();
  });

  it('clamps the start index', () => {
    expect(createQueue([t(1), t(2)], 9).index).toBe(1);
    expect(createQueue([t(1), t(2)], -3).index).toBe(0);
  });

  it('moves next and prev within bounds', () => {
    const q = createQueue([t(1), t(2)]);
    expect(hasPrev(q)).toBe(false);
    const q2 = moveNext(q);
    expect(currentTrack(q2)?.id).toBe('jamendo:2');
    expect(hasNext(q2)).toBe(false);
    expect(moveNext(q2)).toBe(q2);
    expect(currentTrack(movePrev(q2))?.id).toBe('jamendo:1');
  });

  it('selectTrack jumps to a queued track or starts a new queue', () => {
    const q = createQueue([t(1), t(2), t(3)]);
    expect(selectTrack(q, t(3)).index).toBe(2);
    const fresh = selectTrack(q, t(9));
    expect(fresh.tracks).toHaveLength(1);
    expect(currentTrack(fresh)?.id).toBe('jamendo:9');
  });

  it('enqueue appends and sets index on an empty queue', () => {
    const q = enqueue(emptyQueue, t(1), t(2));
    expect(q.index).toBe(0);
    expect(q.tracks).toHaveLength(2);
  });
});

describe('queue editing', () => {
  const q = (n: number, index = 0) =>
    createQueue(
      Array.from({ length: n }, (_, i) => t(i + 1)),
      index,
    );
  const ids = (queue: { tracks: readonly Track[] }) => queue.tracks.map((x) => x.id.slice(8));

  it('playNext inserts after the current track and moves duplicates', () => {
    const next = playNext(q(4, 1), t(4), t(9));
    expect(ids(next)).toEqual(['1', '2', '4', '9', '3']);
    expect(next.index).toBe(1);
  });

  it('addToQueue appends only new tracks', () => {
    expect(ids(addToQueue(q(2), t(2), t(3)))).toEqual(['1', '2', '3']);
  });

  it('removeAt keeps the current track and fixes the index', () => {
    const r = removeAt(q(4, 2), 0);
    expect(ids(r)).toEqual(['2', '3', '4']);
    expect(currentTrack(r)?.id).toBe('jamendo:3');
    expect(removeAt(q(3, 1), 1)).toEqual(q(3, 1));
  });

  it('moveTrack keeps the current track current', () => {
    const m = moveTrack(q(4, 1), 3, 0);
    expect(ids(m)).toEqual(['4', '1', '2', '3']);
    expect(currentTrack(m)?.id).toBe('jamendo:2');
  });

  it('clearUpcoming drops everything after the current track', () => {
    expect(ids(clearUpcoming(q(4, 1)))).toEqual(['1', '2']);
  });
});

describe('shuffle and repeat', () => {
  const q = createQueue([t(1), t(2), t(3), t(4)], 2);

  it('shuffle puts the current track first and keeps every track', () => {
    const s = shuffleQueue(q, () => 0);
    expect(currentTrack(s)?.id).toBe('jamendo:3');
    expect(s.index).toBe(0);
    expect([...s.tracks].map((x) => x.id).sort()).toEqual(q.tracks.map((x) => x.id).sort());
  });

  it('unshuffle restores the original order around the current track', () => {
    const s = moveNext(shuffleQueue(q, () => 0.5));
    const restored = unshuffleQueue(s, q.tracks);
    expect(restored.tracks).toEqual(q.tracks);
    expect(currentTrack(restored)?.id).toBe(currentTrack(s)?.id);
  });

  it('nextPosition follows repeat rules', () => {
    const last = createQueue([t(1), t(2)], 1);
    expect(nextPosition(last, 'off', true)).toBeNull();
    expect(nextPosition(last, 'all', true)).toBe(0);
    expect(nextPosition(last, 'one', true)).toBe(1);
    // Manual skip ignores repeat-one (and wraps like repeat-all at the end).
    expect(nextPosition(last, 'one', false)).toBe(0);
    expect(nextPosition(createQueue([t(1), t(2)], 0), 'one', false)).toBe(1);
  });

  it('prevPosition wraps only with repeat-all', () => {
    const first = createQueue([t(1), t(2), t(3)], 0);
    expect(prevPosition(first, 'off')).toBeNull();
    expect(prevPosition(first, 'all')).toBe(2);
  });
});
