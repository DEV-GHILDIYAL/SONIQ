import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { emptyQueue, type QueueState, type RepeatMode } from '@/player/queue';
import type { Track } from '@/sources/types';

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

/**
 * Player state only. No playback logic lives here:
 * src/player/engine.ts is the only writer, UI only reads.
 */
export interface PlayerState {
  queue: QueueState;
  status: PlaybackStatus;
  positionSec: number;
  durationSec: number;
  error: string | null;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Queue order before shuffle was turned on (restored when it is turned off). */
  unshuffled: readonly Track[] | null;
}

export const initialPlayerState: PlayerState = {
  queue: emptyQueue,
  status: 'idle',
  positionSec: 0,
  durationSec: 0,
  error: null,
  shuffle: false,
  repeat: 'off',
  unshuffled: null,
};

export const usePlayerStore = create<PlayerState>()(
  persist(() => ({ ...initialPlayerState }), {
    name: 'soniq:player-prefs',
    storage: createJSONStorage(() => appStorage),
    // Only user preferences survive a restart; the queue does not.
    partialize: (s) => ({ shuffle: s.shuffle, repeat: s.repeat }),
    version: 1,
  }),
);
