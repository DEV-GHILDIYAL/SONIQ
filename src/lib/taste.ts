/**
 * The listener's taste, built ONLY from their own activity on this phone:
 * finished songs (+), early skips (−), likes and playlist adds (++). Scores fade with a
 * 30-day half-life so recent taste counts most. Nothing from other users is used.
 */
import type { Track } from '@/sources/types';
import { useLikedStore } from '@/store/likedStore';
import { usePlaylistStore } from '@/store/playlistStore';
import { topEntries, useProfileStore, type PlayRecord } from '@/store/profileStore';
import { useRecentStore } from '@/store/recentStore';
import { useTasteStore, type ArtistScore, type Score } from '@/store/tasteStore';

const HALF_LIFE_DAYS = 30;
const DAY_MS = 86_400_000;
const MAX_TRACKS = 1500;
const MAX_ARTISTS = 400;

export const SIGNAL = {
  finished: 1,
  partial: 0.3,
  skipped: -0.7,
  liked: 2,
  unliked: -1,
  addedToPlaylist: 1.5,
  notInterested: -3,
} as const;

/** "Arijit Singh, Shreya Ghoshal" / "A feat. B" → "arijit singh" (the main artist). */
export function artistNorm(artist: string): string {
  return (
    artist
      .toLowerCase()
      .split(/,|&| x | feat\.?| ft\.?| featuring | and /)[0]
      ?.replace(/\s*-\s*topic$/, '')
      .replace(/vevo$/, '')
      .replace(/\s+/g, ' ')
      .trim() ?? ''
  );
}

export const titleKey = (t: { title: string; artist: string }) =>
  `${t.title}|${t.artist}`.toLowerCase().replace(/\s+/g, ' ');

export function decayed(score: Score | undefined, now = Date.now()): number {
  if (!score) return 0;
  return score.s * Math.pow(0.5, (now - score.t) / (HALF_LIFE_DAYS * DAY_MS));
}

function bump<T extends Score>(
  prev: T | undefined,
  signal: number,
  now: number,
  extra: Omit<T, 's' | 't'>,
): T {
  return { ...extra, s: decayed(prev, now) + signal, t: now } as T;
}

/** Keep the biggest (absolute) scores only, so storage stays small. */
function trim<T extends Score>(
  map: Record<string, T>,
  max: number,
  now: number,
): Record<string, T> {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  const kept = keys
    .sort((a, b) => Math.abs(decayed(map[b], now)) - Math.abs(decayed(map[a], now)))
    .slice(0, max);
  return Object.fromEntries(kept.map((k) => [k, map[k] as T]));
}

/** Apply one signal to a song and its artist. */
export function applySignal(
  track: { id: string; title: string; artist: string },
  signal: number,
): void {
  const now = Date.now();
  const a = artistNorm(track.artist);
  useTasteStore.setState((s) => ({
    tracks: trim(
      { ...s.tracks, [track.id]: bump(s.tracks[track.id], signal, now, {}) },
      MAX_TRACKS,
      now,
    ),
    artists: a
      ? trim(
          {
            ...s.artists,
            [a]: bump<ArtistScore>(s.artists[a], signal * 0.6, now, { name: track.artist }),
          },
          MAX_ARTISTS,
          now,
        )
      : s.artists,
  }));
}

/** How a finished listen counts: most of the song = liked it, a quick skip = didn't. */
export function listenSignal(r: PlayRecord): number {
  const listened = r.listenedSec ?? 0;
  const duration = r.durationSec && r.durationSec > 0 ? r.durationSec : 0;
  const ratio = duration ? listened / duration : listened >= 120 ? 1 : 0.5;
  if (ratio >= 0.8) return SIGNAL.finished;
  if (listened < 30 && ratio < 0.3) return SIGNAL.skipped;
  if (ratio >= 0.3) return SIGNAL.partial;
  return 0;
}

// ---------- Reading the taste ----------

export function trackScore(id: string): number {
  return decayed(useTasteStore.getState().tracks[id]);
}

export function artistScore(artist: string): number {
  return decayed(useTasteStore.getState().artists[artistNorm(artist)]);
}

export function isBlockedArtist(artist: string): boolean {
  return useTasteStore.getState().blockedArtists.includes(artistNorm(artist));
}

export function isNotInterested(t: Track): boolean {
  const list = useTasteStore.getState().notInterested;
  return list.includes(t.id) || list.includes(titleKey(t));
}

/** Can this song be recommended at all? */
export function allowed(t: Track): boolean {
  return (
    t.source !== 'local' &&
    !isNotInterested(t) &&
    !isBlockedArtist(t.artist) &&
    trackScore(t.id) > -1
  );
}

/** Favourite artists right now (display names), best first. */
export function topArtists(n: number): string[] {
  const { artists, blockedArtists } = useTasteStore.getState();
  const now = Date.now();
  return Object.entries(artists)
    .filter(([k]) => !blockedArtists.includes(k))
    .map(([, v]) => [v.name, decayed(v, now)] as const)
    .filter(([, s]) => s > 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name]) => name);
}

/** Artists the user keeps skipping (for the AI prompt: "avoid"). */
export function dislikedArtists(n: number): string[] {
  const { artists } = useTasteStore.getState();
  const now = Date.now();
  return Object.values(artists)
    .map((v) => [v.name, decayed(v, now)] as const)
    .filter(([, s]) => s < -1)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([name]) => name);
}

export function topGenres(n: number): string[] {
  return topEntries(useProfileStore.getState().genreCounts, n).map(([g]) => g);
}

/** Every song we know as a full Track (liked, playlists, recent), deduplicated. */
export function knownTracks(): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  const add = (t: Track) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    out.push(t);
  };
  useLikedStore.getState().tracks.forEach(add);
  useRecentStore.getState().tracks.forEach(add);
  usePlaylistStore.getState().playlists.forEach((p) => p.tracks.forEach(add));
  return out;
}

// ---------- Feedback ----------

export function markNotInterested(t: Track): void {
  applySignal(t, SIGNAL.notInterested);
  useTasteStore.setState((s) => ({
    notInterested: [
      t.id,
      titleKey(t),
      ...s.notInterested.filter((x) => x !== t.id && x !== titleKey(t)),
    ].slice(0, 600),
  }));
}

export function blockArtist(artist: string): void {
  const a = artistNorm(artist);
  if (!a) return;
  useTasteStore.setState((s) => ({
    blockedArtists: [a, ...s.blockedArtists.filter((x) => x !== a)].slice(0, 300),
  }));
}

export function unblockArtist(artist: string): void {
  const a = artistNorm(artist);
  useTasteStore.setState((s) => ({ blockedArtists: s.blockedArtists.filter((x) => x !== a) }));
}

// ---------- Tracking ----------

/** >0 while the app itself changes playlists (e.g. AI "Add similar"): not the user's taste. */
let muted = 0;

/** Run `fn` without turning its playlist changes into taste signals. */
export function withoutTasteSignals<T>(fn: () => T): T {
  muted++;
  try {
    return fn();
  } finally {
    muted--;
  }
}

function processHistory(history: readonly PlayRecord[]): void {
  const { processedUntil } = useTasteStore.getState();
  let newest = processedUntil;
  // Oldest first so decay order is right.
  for (const r of [...history].reverse()) {
    if (r.at <= processedUntil || r.listenedSec === undefined) continue;
    const signal = listenSignal(r);
    if (signal !== 0) applySignal({ id: r.trackId, title: r.title, artist: r.artist }, signal);
    newest = Math.max(newest, r.at);
  }
  if (newest !== processedUntil) useTasteStore.setState({ processedUntil: newest });
}

let started = false;

/** Started once from the root layout. */
export function startTasteTracking(): void {
  if (started) return;
  started = true;
  // Only once both stores are loaded from disk, or old listens would be counted twice.
  const ready = () => useProfileStore.persist.hasHydrated() && useTasteStore.persist.hasHydrated();
  const kick = () => {
    if (ready()) processHistory(useProfileStore.getState().history);
  };
  useProfileStore.subscribe((s, prev) => {
    if (s.history !== prev.history && ready()) processHistory(s.history);
  });
  // Loading from disk also looks like "new" likes / playlist songs: ignore until loaded.
  useLikedStore.subscribe((s, prev) => {
    if (s.tracks === prev.tracks || !useLikedStore.persist.hasHydrated()) return;
    const before = new Set(prev.tracks.map((t) => t.id));
    const after = new Set(s.tracks.map((t) => t.id));
    for (const t of s.tracks) if (!before.has(t.id)) applySignal(t, SIGNAL.liked);
    for (const t of prev.tracks) if (!after.has(t.id)) applySignal(t, SIGNAL.unliked);
  });
  usePlaylistStore.subscribe((s, prev) => {
    if (s.playlists === prev.playlists || muted > 0 || !usePlaylistStore.persist.hasHydrated())
      return;
    const before = new Map(prev.playlists.map((p) => [p.id, new Set(p.tracks.map((t) => t.id))]));
    for (const p of s.playlists) {
      const old = before.get(p.id);
      if (!old) continue; // new or imported playlist: not a taste signal
      for (const t of p.tracks) if (!old.has(t.id)) applySignal(t, SIGNAL.addedToPlaylist);
    }
  });
  // History may already be on disk (first run after update: learn from it once).
  useProfileStore.persist.onFinishHydration(kick);
  useTasteStore.persist.onFinishHydration(kick);
  kick();
}
