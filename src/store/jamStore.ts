import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RoomMember } from '@/lib/realtime';
import type { Track } from '@/sources/types';

export type JamStatus = 'idle' | 'connecting' | 'active';

/** What guests may do (set by the host). */
export type GuestMode = 'listen' | 'add' | 'control';

/** The Jam you were in, so you can rejoin after the app was closed. */
export interface LastJam {
  code: string;
  role: 'host' | 'guest';
  isPublic: boolean;
  guestMode: GuestMode;
  /** Last time we were in it (ms). */
  at: number;
}

interface JamStoreState {
  status: JamStatus;
  role: 'host' | 'guest' | null;
  code: string | null;
  members: RoomMember[];
  /** Host's upcoming tracks (guests see what's next). */
  upNext: Track[];
  /** Who added which upcoming track (track id → name). */
  upNextBy: Record<string, string>;
  /** Short info line ("Riya added Kesariya", "Host ended the Jam"). */
  notice: string | null;
  error: string | null;
  /** Display name shown to others. Persisted. */
  myName: string;
  /** Public: friends see it and anyone with the link can join. Private: code only, invisible. */
  isPublic: boolean;
  guestMode: GuestMode;
  /** Our own connection dropped and is reconnecting. */
  reconnecting: boolean;
  /** Guest: the host hasn't been heard from for a while (we keep waiting). */
  hostOffline: boolean;
  lastJam: LastJam | null;
  setName: (name: string) => void;
}

/** Jam state only; src/jam/session.ts is the only writer apart from setName. */
export const useJamStore = create<JamStoreState>()(
  persist(
    (set) => ({
      status: 'idle',
      role: null,
      code: null,
      members: [],
      upNext: [],
      upNextBy: {},
      notice: null,
      error: null,
      myName: '',
      isPublic: false,
      guestMode: 'add',
      reconnecting: false,
      hostOffline: false,
      lastJam: null,
      setName: (name) => set({ myName: name.slice(0, 24) }),
    }),
    {
      name: 'soniq:jam',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ myName: s.myName, lastJam: s.lastJam }),
      version: 1,
    },
  ),
);
