/**
 * Autoplay / radio: when the queue runs out, find similar songs to keep playing.
 * "Similar" for now = same artist first, then the user's favourite genre / artists.
 * Wired into the player with setAutoplayProvider() in the root layout.
 */
import { getGroqRecommendations, isGroqConfigured } from './groq';
import { isJamGuest } from '@/jam/session';
import { searchAll } from '@/sources/registry';
import type { Track } from '@/sources/types';
import { topEntries, useProfileStore } from '@/store/profileStore';
import { useSettingsStore } from '@/store/settingsStore';

const WANT = 10;

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const titleKey = (t: Track) => `${t.title}|${t.artist}`.toLowerCase().replace(/\s+/g, ' ');

/** Up to 10 songs to play after `seed`, skipping anything already in `queue` or played recently. */
export async function radioTracks(seed: Track, queue: readonly Track[]): Promise<Track[]> {
  if (!useSettingsStore.getState().autoplay || isJamGuest()) return [];
  const profile = useProfileStore.getState();
  const seen = new Set(
    [...queue, ...profile.history.slice(0, 50).map((h) => ({ id: h.trackId, title: h.title, artist: h.artist }))].map(
      (t) => t.id,
    ),
  );
  const seenTitles = new Set(queue.map(titleKey));

  const picked: Track[] = [];

  // 1. Try smart Groq AI recommendation first if configured
  if (isGroqConfigured()) {
    try {
      const topArtists = topEntries(profile.artistCounts, 5).map(([a]) => a);
      const topGenres = topEntries(profile.genreCounts, 4).map(([g]) => g);
      const suggestions = await getGroqRecommendations(seed, profile.history, topArtists, topGenres, 5);

      for (const sug of suggestions) {
        if (picked.length >= WANT) break;
        try {
          const results = await searchAll(`${sug.title} ${sug.artist}`);
          const match = results.find(
            (t) => !seen.has(t.id) && !seenTitles.has(titleKey(t)) && t.source !== 'local',
          );
          if (match) {
            seen.add(match.id);
            seenTitles.add(titleKey(match));
            picked.push(match);
          }
        } catch {
          // ignore and continue
        }
      }
    } catch {
      // Groq failed; seamlessly fall back to local rule-based queries
    }
  }

  // 2. Fall back / top up with local artist & genre queries
  const queries = [
    seed.source === 'local' ? '' : seed.artist,
    topEntries(profile.genreCounts, 1)[0]?.[0] ?? '',
    ...shuffle(topEntries(profile.artistCounts, 5).map(([a]) => a)).slice(0, 2),
  ].filter((q, i, all) => q && all.indexOf(q) === i);

  for (const q of queries) {
    if (picked.length >= WANT) break;
    let found: Track[] = [];
    try {
      found = await searchAll(q);
    } catch {
      continue;
    }
    for (const t of shuffle(found)) {
      if (picked.length >= WANT) break;
      const key = titleKey(t);
      if (t.source === 'local' || seen.has(t.id) || seenTitles.has(key)) continue;
      seen.add(t.id);
      seenTitles.add(key);
      picked.push(t);
    }
  }
  return picked;
}
