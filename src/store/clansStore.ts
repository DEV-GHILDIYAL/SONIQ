import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface ClanLastMessage {
  kind: ClanMessageKind;
  body: string;
  name: string | null;
  at: string;
}

/** One row of the Clans list. */
export interface ClanSummary {
  id: string;
  name: string;
  emoji: string;
  code: string;
  owner: boolean;
  members: number;
  unread: number;
  last: ClanLastMessage | null;
  last_at: string;
}

export interface ClanMember {
  id: string;
  name: string;
  owner: boolean;
}

export type ClanMessageKind = 'text' | 'jam' | 'system';

export interface ClanMessage {
  id: number;
  user_id: string | null;
  name: string;
  kind: ClanMessageKind;
  /** Text, or for system messages: joined | left | removed. */
  body: string;
  /** Jam code for Jam cards. */
  jam: string | null;
  /** Jam card whose Jam has ended (host ended it, or the sender shared a newer Jam). */
  ended?: boolean;
  at: string;
}

export interface ClanDetail {
  id: string;
  name: string;
  emoji: string;
  code: string;
  owner: boolean;
  members: ClanMember[];
  messages: ClanMessage[];
}

interface ClansState {
  /** Profile these lists belong to (ignored after restoring a different account). */
  ownerId: string | null;
  clans: ClanSummary[];
  /** Opened clans (not persisted). */
  details: Record<string, ClanDetail>;
  setClans: (ownerId: string, clans: ClanSummary[]) => void;
  setDetail: (detail: ClanDetail) => void;
  removeClan: (id: string) => void;
}

export const useClansStore = create<ClansState>()(
  persist(
    (set) => ({
      ownerId: null,
      clans: [],
      details: {},
      setClans: (ownerId, clans) => set({ ownerId, clans }),
      setDetail: (detail) =>
        set((s) => ({
          details: { ...s.details, [detail.id]: detail },
          clans: (s.clans.some((c) => c.id === detail.id)
            ? s.clans
            : [
                {
                  id: detail.id,
                  name: detail.name,
                  emoji: detail.emoji,
                  code: detail.code,
                  owner: detail.owner,
                  members: detail.members.length,
                  unread: 0,
                  last: null,
                  last_at: new Date().toISOString(),
                },
                ...s.clans,
              ]
          ).map((c) =>
            c.id === detail.id
              ? {
                  ...c,
                  unread: 0,
                  name: detail.name,
                  emoji: detail.emoji,
                  code: detail.code,
                  owner: detail.owner,
                }
              : c,
          ),
        })),
      removeClan: (id) =>
        set((s) => {
          const { [id]: _gone, ...details } = s.details;
          return { clans: s.clans.filter((c) => c.id !== id), details };
        }),
    }),
    {
      name: 'soniq:clans',
      storage: createJSONStorage(() => appStorage),
      partialize: ({ ownerId, clans }) => ({ ownerId, clans }),
      version: 1,
    },
  ),
);
