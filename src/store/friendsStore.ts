import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** A friend's current PUBLIC Jam (private Jams are never visible). */
export interface FriendJam {
  code: string;
  /** true = they started it; false = they joined someone's public Jam. */
  host: boolean;
  title: string | null;
  artist: string | null;
  members: number;
}

export interface FriendEntry {
  id: string;
  name: string;
  jam?: FriendJam | null;
  /** When they became friends / the request was sent / they were blocked (ISO). */
  at: string;
}

export interface FriendLists {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
  blocked: FriendEntry[];
}

export const EMPTY_FRIENDS: FriendLists = { friends: [], incoming: [], outgoing: [], blocked: [] };

interface FriendsState extends FriendLists {
  /** Profile these lists belong to (ignored after restoring a different account). */
  ownerId: string | null;
  setLists: (ownerId: string, lists: FriendLists) => void;
}

/** Last copy of the server's friend lists, so the screen opens instantly (even offline). */
export const useFriendsStore = create<FriendsState>()(
  persist(
    (set) => ({
      ...EMPTY_FRIENDS,
      ownerId: null,
      setLists: (ownerId, lists) => set({ ownerId, ...lists }),
    }),
    {
      name: 'soniq:friends',
      storage: createJSONStorage(() => appStorage),
      partialize: ({ ownerId, friends, incoming, outgoing, blocked }) => ({
        ownerId,
        friends,
        incoming,
        outgoing,
        blocked,
      }),
      version: 1,
    },
  ),
);
