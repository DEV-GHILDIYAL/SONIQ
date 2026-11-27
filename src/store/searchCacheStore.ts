import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Track } from '@/sources/types';

export const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;
export const MAX_SAVED_SEARCHES = 30;

interface SavedSearch {
  tracks: Track[];
  at: number;
}

interface SearchCacheState {
  items: Record<string, SavedSearch>;
  save: (key: string, tracks: Track[]) => void;
  getSaved: (key: string) => Track[] | undefined;
  clear: () => void;
}

export const useSearchCacheStore = create<SearchCacheState>()(
  persist(
    (set, get) => ({
      items: {},
      save: (key, tracks) =>
        set((s) => {
          const items = { ...s.items, [key]: { tracks, at: Date.now() } };
          const keys = Object.keys(items).sort((a, b) => (items[a]?.at ?? 0) - (items[b]?.at ?? 0));
          for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SAVED_SEARCHES))) {
            delete items[old];
          }
          return { items };
        }),
      getSaved: (key) => {
        const hit = get().items[key];
        if (!hit || Date.now() - hit.at > SEARCH_CACHE_TTL_MS) return undefined;
        return hit.tracks;
      },
      clear: () => set({ items: {} }),
    }),
    {
      name: 'soniq:search-cache',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ items: s.items }),
      version: 1,
    },
  ),
);
