/**
 * Autoplay / radio: when the queue runs out, keep playing songs picked for THIS listener.
 * Not just "more of the current song": a blend of
 *   - songs that flow after the current one (AI, using the listener's taste),
 *   - songs by artists the listener loves (their own history),
 *   - a little discovery (cached Fresh Finds),
 * minus anything skipped a lot, marked "not interested" or by a blocked artist.
 * Wired into the player with setAutoplayProvider() in the root layout.
 */
import { isJamGuest } from '@/jam/session';
import { searchAll } from '@/sources/registry';
import type { Track } from '@/sources/types';
import { useProfileStore } from '@/store/profileStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getGroqRecommendations, isGroqConfigured } from './groq';
import { diversify, discoveryPool, resolveSuggestions, tasteSummary } from './recommendations';
import { allowed, artistNorm, artistScore, titleKey, topArtists } from './taste';

const WANT = 10;
/** How many of each kind, in this order: flow with the current song, favourites, discovery. */
const QUOTA = { flow: 4, taste: 4, discovery: 2 };

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

async function search(q: string): Promise<Track[]> {
  try {
    return (await searchAll(q)).filter(allowed);
  } catch {
    return [];
  }
}

/** Favourite artists first, with a little randomness so radio doesn't repeat itself. */
const byTaste = (tracks: Track[]) =>
  [...tracks].sort(
    (a, b) => artistScore(b.artist) + Math.random() - (artistScore(a.artist) + Math.random()),
  );

/** Up to 10 songs to play after `seed`, skipping anything already in `queue` or played recently. */
export async function radioTracks(seed: Track, queue: readonly Track[]): Promise<Track[]> {
  if (!useSettingsStore.getState().autoplay || isJamGuest()) return [];
  const history = useProfileStore.getState().history.slice(0, 60);
  const exclude = new Set<string>([
    ...queue.flatMap((t) => [t.id, titleKey(t)]),
    ...history.flatMap((h) => [h.trackId, titleKey(h)]),
  ]);
  const fresh = (list: Track[]) =>
    list.filter((t) => !exclude.has(t.id) && !exclude.has(titleKey(t)));

  const favourites = shuffle(topArtists(6)).slice(0, 2);
  const [flow, taste] = await Promise.all([
    isGroqConfigured()
      ? getGroqRecommendations(
          seed,
          tasteSummary(),
          history.slice(0, 20).map((h) => `${h.title} - ${h.artist}`),
          6,
        ).then(resolveSuggestions)
      : search(seed.source === 'local' ? '' : seed.artist),
    Promise.all(favourites.map(search)).then((r) => r.flat()),
  ]);

  const pools = {
    flow: fresh(flow),
    taste: byTaste(fresh(taste)),
    discovery: shuffle(fresh(discoveryPool())),
  };
  const picked = diversify(
    [
      ...pools.flow.slice(0, QUOTA.flow),
      ...pools.taste.slice(0, QUOTA.taste),
      ...pools.discovery.slice(0, QUOTA.discovery),
      // Top up from whatever is left if a pool came back short.
      ...pools.flow.slice(QUOTA.flow),
      ...pools.taste.slice(QUOTA.taste),
    ],
    WANT,
    2,
    new Set([seed.id, titleKey(seed)]),
  );
  // Keep the "flows from the current song" picks first, then mix the rest.
  const first = picked.filter((t) => pools.flow.includes(t)).slice(0, 2);
  const rest = shuffle(picked.filter((t) => !first.includes(t)));
  // Avoid the same artist twice in a row.
  const out: Track[] = [...first];
  for (const t of rest) {
    const prev = out[out.length - 1];
    if (prev && artistNorm(prev.artist) === artistNorm(t.artist))
      out.splice(Math.max(0, out.length - 1), 0, t);
    else out.push(t);
  }
  return out;
}
