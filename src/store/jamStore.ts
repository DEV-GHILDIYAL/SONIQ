import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RoomMember } from '@/lib/realtime';
import type { Track } from '@/sources/types';

export type JamStatus = 'idle' | 'connecting' | 'active';

interface JamStoreState {
  status: JamStatus;
  role: 'host' | 'guest' | null;
  code: string | null;
  members: RoomMember[];
  /** Host's upcoming tracks (guests see what's next). */
  upNext: Track[];
  /** Short info line ("Riya added Kesariya", "Host ended the Jam"). */
  notice: string | null;
  error: string | null;
  /** Display name shown to others. Persisted. */
  myName: string;
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
      notice: null,
      error: null,
      myName: '',
      setName: (name) => set({ myName: name.slice(0, 24) }),
    }),
    {
      name: 'soniq:jam',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ myName: s.myName }),
      version: 1,
    },
  ),
);
