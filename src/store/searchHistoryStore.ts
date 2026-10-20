import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Track } from '@/sources/types';

/** Recent searches shown when Search opens (Spotify style): typed searches and songs played from results. */
export const MAX_RECENT_SEARCHES = 20;

export type RecentSearch =
  | { kind: 'query'; text: string; at: number }
  | { kind: 'track'; track: Track; at: number };

interface SearchHistoryState {
  /** Newest first, unique, at most MAX_RECENT_SEARCHES. */
  items: RecentSearch[];
  /** Remember a typed search. */
  add: (query: string) => void;
  /** Remember a song picked from search results. */
  addTrack: (track: Track) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const norm = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Stable identity of an entry, used for de-duplication and removal. */
export const recentKey = (item: RecentSearch) =>
  item.kind === 'query' ? `q:${item.text.toLowerCase()}` : `t:${item.track.id}`;

const push = (items: RecentSearch[], item: RecentSearch) => {
  const key = recentKey(item);
  return [item, ...items.filter((i) => recentKey(i) !== key)].slice(0, MAX_RECENT_SEARCHES);
};

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set) => ({
      items: [],
      add: (query) => {
        const text = norm(query);
        if (text.length < 2) return;
        set((s) => ({ items: push(s.items, { kind: 'query', text, at: Date.now() }) }));
      },
      addTrack: (track) =>
        set((s) => ({ items: push(s.items, { kind: 'track', track, at: Date.now() }) })),
      remove: (key) => set((s) => ({ items: s.items.filter((i) => recentKey(i) !== key) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'soniq:search-history',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ items: s.items }),
      version: 2,
      // v1 stored only typed searches as `queries: string[]`.
      migrate: (persisted, version) => {
        if (version < 2) {
          const old = (persisted as { queries?: string[] } | null)?.queries ?? [];
          return {
            items: old.map((text, i): RecentSearch => ({ kind: 'query', text, at: Date.now() - i })),
          };
        }
        return persisted as { items: RecentSearch[] };
      },
    },
  ),
);

/** Typed searches, newest first (for suggestions). */
export const recentQueries = (items: readonly RecentSearch[]) =>
  items.flatMap((i) => (i.kind === 'query' ? [i.text] : []));

/**
 * Suggestions while typing: past searches and songs first, then artists the user plays,
 * matching from the start of any word. Never repeats the input itself.
 */
export function suggestionsFor(
  input: string,
  history: readonly string[],
  artists: readonly string[],
  max = 5,
): string[] {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  const matches = (text: string) => {
    const t = text.toLowerCase();
    return t !== q && (t.startsWith(q) || t.includes(` ${q}`));
  };
  const out: string[] = [];
  for (const c of [...history, ...artists]) {
    if (out.length >= max) break;
    if (matches(c) && !out.some((o) => o.toLowerCase() === c.toLowerCase())) out.push(c);
  }
  return out;
}
