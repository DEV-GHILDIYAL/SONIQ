import type { Track } from '@/sources/types';

/** Immutable play queue. `index` is -1 when the queue is empty. */
export interface QueueState {
  tracks: readonly Track[];
  index: number;
}

export const emptyQueue: QueueState = { tracks: [], index: -1 };

/** Build a queue from a list, starting at `startIndex` (clamped to a valid range). */
export function createQueue(tracks: readonly Track[], startIndex = 0): QueueState {
  if (tracks.length === 0) return emptyQueue;
  const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
  return { tracks: [...tracks], index };
}

export function currentTrack(queue: QueueState): Track | undefined {
  return queue.tracks[queue.index];
}

export function hasNext(queue: QueueState): boolean {
  return queue.index >= 0 && queue.index < queue.tracks.length - 1;
}

export function hasPrev(queue: QueueState): boolean {
  return queue.index > 0;
}

/** Move to the next track. Returns the same queue when already at the end. */
export function moveNext(queue: QueueState): QueueState {
  return hasNext(queue) ? { ...queue, index: queue.index + 1 } : queue;
}

/** Move to the previous track. Returns the same queue when already at the start. */
export function movePrev(queue: QueueState): QueueState {
  return hasPrev(queue) ? { ...queue, index: queue.index - 1 } : queue;
}

/**
 * Make `track` current. If it is already in the queue, jump to it;
 * otherwise start a new single-track queue.
 */
export function selectTrack(queue: QueueState, track: Track): QueueState {
  const found = queue.tracks.findIndex((t) => t.id === track.id);
  return found >= 0 ? { ...queue, index: found } : createQueue([track]);
}

/** Append tracks to the end of the queue. */
export function enqueue(queue: QueueState, ...tracks: Track[]): QueueState {
  if (tracks.length === 0) return queue;
  const all = [...queue.tracks, ...tracks];
  return { tracks: all, index: queue.index < 0 ? 0 : queue.index };
}

export type RepeatMode = 'off' | 'all' | 'one';

/** Insert tracks right after the current one (duplicates already in the queue are moved). */
export function playNext(queue: QueueState, ...tracks: Track[]): QueueState {
  if (tracks.length === 0) return queue;
  if (queue.index < 0) return createQueue(tracks);
  const current = queue.tracks[queue.index];
  const ids = new Set(tracks.map((t) => t.id));
  const fresh = tracks.filter((t) => t.id !== current?.id);
  const rest = queue.tracks.filter((t, i) => i === queue.index || !ids.has(t.id));
  const index = rest.findIndex((t) => t.id === current?.id);
  return { tracks: [...rest.slice(0, index + 1), ...fresh, ...rest.slice(index + 1)], index };
}

/** Append tracks that are not already queued. */
export function addToQueue(queue: QueueState, ...tracks: Track[]): QueueState {
  const known = new Set(queue.tracks.map((t) => t.id));
  return enqueue(queue, ...tracks.filter((t) => !known.has(t.id)));
}

/** Remove the track at `i`. The current track cannot be removed (use next() instead). */
export function removeAt(queue: QueueState, i: number): QueueState {
  if (i < 0 || i >= queue.tracks.length || i === queue.index) return queue;
  const tracks = queue.tracks.filter((_, j) => j !== i);
  return { tracks, index: i < queue.index ? queue.index - 1 : queue.index };
}

/** Move a track from one position to another, keeping the current track current. */
export function moveTrack(queue: QueueState, from: number, to: number): QueueState {
  const n = queue.tracks.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return queue;
  const tracks = [...queue.tracks];
  const [item] = tracks.splice(from, 1);
  if (!item) return queue;
  tracks.splice(to, 0, item);
  const currentId = queue.tracks[queue.index]?.id;
  return { tracks, index: tracks.findIndex((t) => t.id === currentId) };
}

/** Drop everything after the current track. */
export function clearUpcoming(queue: QueueState): QueueState {
  if (queue.index < 0) return queue;
  return { tracks: queue.tracks.slice(0, queue.index + 1), index: queue.index };
}

/** Fisher-Yates shuffle with the current track moved to the front. */
export function shuffleQueue(queue: QueueState, random: () => number = Math.random): QueueState {
  if (queue.tracks.length < 2) return queue;
  const current = queue.tracks[queue.index];
  const rest = queue.tracks.filter((_, i) => i !== queue.index);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = rest[i];
    const b = rest[j];
    if (a && b) {
      rest[i] = b;
      rest[j] = a;
    }
  }
  return current ? { tracks: [current, ...rest], index: 0 } : { tracks: rest, index: 0 };
}

/** Restore the original order, keeping the current track current. */
export function unshuffleQueue(queue: QueueState, original: readonly Track[]): QueueState {
  const currentId = queue.tracks[queue.index]?.id;
  const queuedIds = new Set(queue.tracks.map((t) => t.id));
  const originalIds = new Set(original.map((t) => t.id));
  // Keep tracks added while shuffled (not in `original`) at the end.
  const tracks = [
    ...original.filter((t) => queuedIds.has(t.id)),
    ...queue.tracks.filter((t) => !originalIds.has(t.id)),
  ];
  return {
    tracks,
    index: Math.max(
      0,
      tracks.findIndex((t) => t.id === currentId),
    ),
  };
}

/**
 * Where to go after the current track.
 * `auto` = the track finished by itself (repeat-one replays it); manual skips always move on.
 * Returns null when playback should stop.
 */
export function nextPosition(queue: QueueState, repeat: RepeatMode, auto: boolean): number | null {
  if (queue.tracks.length === 0) return null;
  if (auto && repeat === 'one') return queue.index;
  if (hasNext(queue)) return queue.index + 1;
  return repeat === 'off' ? null : 0;
}

/** Previous position for a manual "previous" (wraps to the end with repeat-all). */
export function prevPosition(queue: QueueState, repeat: RepeatMode): number | null {
  if (hasPrev(queue)) return queue.index - 1;
  return repeat === 'all' && queue.tracks.length > 1 ? queue.tracks.length - 1 : null;
}
