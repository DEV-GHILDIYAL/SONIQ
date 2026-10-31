/**
 * "Made for you": personal mixes built ONLY from this listener's own history (see taste.ts).
 * Groq (if configured) suggests songs from the taste summary; every suggestion is looked up
 * with the normal search, filtered (not interested, blocked artists) and de-duplicated.
 * Built in the background at most every 12 h and cached on the phone.
 */
import { searchAll } from '@/sources/registry';
import type { Track } from '@/sources/types';
import { useLikedStore } from '@/store/likedStore';
import { useProfileStore } from '@/store/profileStore';
import { useRecsStore, type Mix } from '@/store/recsStore';
import { askGroqForSongs, isGroqConfigured, type AiSuggestion } from './groq';
import {
  allowed,
  artistNorm,
  artistScore,
  dislikedArtists,
  knownTracks,
  titleKey,
  topArtists,
  topGenres,
  trackScore,
} from './taste';

const STALE_MS = 12 * 60 * 60_000;
const MIX_SIZE = 25;
const SEARCH_CONCURRENCY = 3;

/** One line about the listener for the AI, from their own data only. */
export function tasteSummary(): string {
  const loved = knownTracks()
    .map((t) => [t, trackScore(t.id)] as const)
    .filter(([, s]) => s > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => `"${t.title}" by ${t.artist}`);
  const parts = [
    topArtists(8).length ? `loves: ${topArtists(8).join(', ')}` : '',
    topGenres(4).length ? `genres: ${topGenres(4).join(', ')}` : '',
    loved.length ? `favourite songs: ${loved.join('; ')}` : '',
    dislikedArtists(6).length ? `skips: ${dislikedArtists(6).join(', ')}` : '',
  ];
  return parts.filter(Boolean).join(' | ');
}

/** Run `fn` over `items`, a few at a time. */
async function pool<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, items.length) }, worker));
  return out;
}

async function safeSearch(q: string): Promise<Track[]> {
  try {
    return await searchAll(q);
  } catch {
    return [];
  }
}

/** Find a playable track for each AI suggestion (same artist preferred). */
export async function resolveSuggestions(list: readonly AiSuggestion[]): Promise<Track[]> {
  const found = await pool(list, async (s) => {
    const results = (await safeSearch(`${s.title} ${s.artist}`)).filter(allowed);
    const want = artistNorm(s.artist);
    return (
      results.find(
        (t) => artistNorm(t.artist).includes(want) || want.includes(artistNorm(t.artist)),
      ) ??
      results[0] ??
      null
    );
  });
  return found.filter((t): t is Track => t !== null);
}

/** De-duplicate (id and title|artist) and keep at most `perArtist` songs per artist. */
export function diversify(
  tracks: readonly Track[],
  max: number,
  perArtist = 2,
  exclude: Set<string> = new Set(),
): Track[] {
  const seen = new Set(exclude);
  const count = new Map<string, number>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (out.length >= max) break;
    const a = artistNorm(t.artist);
    if (seen.has(t.id) || seen.has(titleKey(t)) || (count.get(a) ?? 0) >= perArtist) continue;
    seen.add(t.id);
    seen.add(titleKey(t));
    count.set(a, (count.get(a) ?? 0) + 1);
    out.push(t);
  }
  return out;
}

/** a1, b1, a2, b2, ... */
function interleave<T>(...lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length) out.push(l[i] as T);
  return out;
}

function namesOf(tracks: readonly Track[], n = 3): string {
  const names: string[] = [];
  for (const t of tracks) {
    const a = t.artist.split(',')[0]?.trim() ?? t.artist;
    if (a && !names.includes(a)) names.push(a);
    if (names.length >= n) break;
  }
  return names.length ? `${names.join(', ')} & more` : 'Songs for you';
}

// ---------- The mixes ----------

function onRepeat(): Mix | null {
  const tracks = knownTracks()
    .filter(allowed)
    .map((t) => [t, trackScore(t.id)] as const)
    .filter(([, s]) => s >= 0.8)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  if (tracks.length < 5) return null;
  return {
    id: 'repeat',
    kind: 'repeat',
    title: 'On Repeat',
    subtitle: 'The songs you can’t stop playing',
    tracks: tracks.slice(0, MIX_SIZE),
  };
}

async function dailyMix(n: number, anchor: string, heard: Set<string>): Promise<Mix | null> {
  const familiar = knownTracks()
    .filter(
      (t) => allowed(t) && artistNorm(t.artist) === artistNorm(anchor) && trackScore(t.id) > 0,
    )
    .slice(0, 8);
  const [byArtist, suggested] = await Promise.all([
    safeSearch(anchor).then((r) => r.filter(allowed)),
    isGroqConfigured()
      ? askGroqForSongs(
          `Make a personal mix around ${anchor} for this listener (${tasteSummary()}).
Include a few more ${anchor} songs they may not know and songs by similar artists in the same language and vibe.`,
          10,
        ).then(resolveSuggestions)
      : Promise.resolve([] as Track[]),
  ]);
  const fresh = (list: Track[]) => list.filter((t) => !heard.has(t.id));
  const tracks = diversify(interleave(familiar, fresh(suggested), fresh(byArtist)), MIX_SIZE, 6);
  if (tracks.length < 6) return null;
  return {
    id: `daily-${n}`,
    kind: 'daily',
    title: `Daily Mix ${n}`,
    subtitle: namesOf([...familiar, ...tracks]),
    tracks,
  };
}

async function freshFinds(heard: Set<string>): Promise<Mix | null> {
  const known = new Set(knownTracks().map((t) => artistNorm(t.artist)));
  for (const r of useProfileStore.getState().history) known.add(artistNorm(r.artist));
  const isNew = (t: Track) =>
    !heard.has(t.id) && artistScore(t.artist) === 0 && !known.has(artistNorm(t.artist));
  let tracks: Track[] = [];
  if (isGroqConfigured()) {
    const suggested = await resolveSuggestions(
      await askGroqForSongs(
        `Discovery mix for this listener (${tasteSummary()}).
ONLY artists they have never played. Do not use any of: ${[...known].slice(0, 40).join(', ') || 'none'}.
Same languages and moods they like, mix of popular and lesser-known gems.`,
        14,
        0.9,
      ),
    );
    tracks = suggested.filter(isNew);
  }
  if (tracks.length < 6) {
    const genre = topGenres(2);
    for (const g of genre)
      tracks.push(...(await safeSearch(g)).filter((t) => allowed(t) && isNew(t)));
  }
  const out = diversify(tracks, 20, 1);
  if (out.length < 5) return null;
  return {
    id: 'fresh',
    kind: 'fresh',
    title: 'Fresh Finds',
    subtitle: 'New artists picked for your taste',
    tracks: out,
  };
}

async function becauseYouLiked(heard: Set<string>): Promise<Mix | null> {
  const seed =
    useLikedStore.getState().tracks.find(allowed) ??
    knownTracks()
      .filter(allowed)
      .sort((a, b) => trackScore(b.id) - trackScore(a.id))[0];
  if (!seed) return null;
  let tracks: Track[] = [];
  if (isGroqConfigured()) {
    tracks = await resolveSuggestions(
      await askGroqForSongs(
        `Songs for someone who loves "${seed.title}" by ${seed.artist}. Same mood, language and era; at most 2 by ${seed.artist}.
Listener profile: ${tasteSummary()}.`,
        12,
      ),
    );
  } else {
    tracks = (await safeSearch(seed.artist)).filter(allowed);
  }
  const out = diversify(
    tracks.filter((t) => !heard.has(t.id)),
    20,
    2,
    new Set([seed.id, titleKey(seed)]),
  );
  if (out.length < 5) return null;
  return {
    id: 'because',
    kind: 'because',
    title: `Because you liked ${seed.title}`,
    subtitle: namesOf(out),
    seedTitle: seed.title,
    tracks: out,
  };
}

let building: Promise<void> | null = null;

/** Build (or refresh) the mixes. Cheap to call: does nothing while fresh unless `force`. */
export function buildMixes(force = false): Promise<void> {
  const { builtAt } = useRecsStore.getState();
  if (!force && Date.now() - builtAt < STALE_MS) return Promise.resolve();
  building ??= (async () => {
    useRecsStore.setState({ building: true });
    try {
      // Songs played in the last ~200 listens don't count as "new" in discovery mixes.
      const heard = new Set(useProfileStore.getState().history.map((h) => h.trackId));
      const anchors = topArtists(3);
      const mixes = await Promise.all([
        Promise.resolve(onRepeat()),
        ...anchors.map((a, i) => dailyMix(i + 1, a, heard)),
        freshFinds(heard),
        becauseYouLiked(heard),
      ]);
      const ready = mixes.filter((m): m is Mix => m !== null);
      // Keep the old mixes if this attempt found nothing (e.g. offline).
      if (ready.length > 0) useRecsStore.setState({ mixes: ready, builtAt: Date.now() });
    } finally {
      useRecsStore.setState({ building: false });
      building = null;
    }
  })();
  return building;
}

/** Discovery songs ready for autoplay (from the cached Fresh Finds mix). */
export function discoveryPool(): Track[] {
  return (
    useRecsStore
      .getState()
      .mixes.find((m) => m.kind === 'fresh')
      ?.tracks.filter(allowed) ?? []
  );
}
