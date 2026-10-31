/**
 * SONIQ DJ: endless personal radio in short sets, with a few spoken words between them.
 * Sets rotate: your favourites → new discoveries → throwbacks → a time-of-day mood.
 * Uses ONLY this listener's own data (taste.ts) plus Groq for picks and the spoken lines;
 * every line also has a personal fallback, so the DJ works without AI too.
 */
import { isJamGuest } from '@/jam/session';
import { djSpeak, djStopSpeaking } from '@/player/djVoice';
import { currentTrack } from '@/player/queue';
import { playQueue } from '@/player/engine';
import { searchAll } from '@/sources/registry';
import type { Track } from '@/sources/types';
import { useDjStore, type DjSegmentKind } from '@/store/djStore';
import { usePlayerStore } from '@/store/playerStore';
import { useProfileStore } from '@/store/profileStore';
import { liveStreak, useStreakStore } from '@/store/streakStore';
import { askGroqForSongs, askGroqLine, isGroqConfigured } from './groq';
import { diversify, discoveryPool, resolveSuggestions, tasteSummary } from './recommendations';
import { allowed, knownTracks, titleKey, topArtists, topGenres, trackScore } from './taste';

const SET_SIZE = 5;
const ORDER: DjSegmentKind[] = ['favourites', 'discover', 'throwback', 'mood'];

const LABEL: Record<DjSegmentKind, string> = {
  favourites: 'Your favourites',
  discover: 'New for you',
  throwback: 'Throwback',
  mood: 'Right now',
};

/** Spoken line waiting for the first song of each set (track id → text). */
const intros = new Map<string, { line: string; kind: DjSegmentKind }>();
/** Every song the DJ queued; playing anything else ends DJ mode. */
const djTracks = new Set<string>();
let lastKind: DjSegmentKind | null = null;

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function timeOfDay(d = new Date()): { label: string; hindi: string } {
  const h = d.getHours();
  if (h < 5) return { label: 'late night', hindi: 'raat' };
  if (h < 12) return { label: 'morning', hindi: 'subah' };
  if (h < 17) return { label: 'afternoon', hindi: 'dopahar' };
  if (h < 21) return { label: 'evening', hindi: 'shaam' };
  return { label: 'late night', hindi: 'raat' };
}

async function search(q: string): Promise<Track[]> {
  try {
    return (await searchAll(q)).filter(allowed);
  } catch {
    return [];
  }
}

function recentlyPlayed(): Set<string> {
  const ids = new Set<string>();
  for (const h of useProfileStore.getState().history.slice(0, 40)) {
    ids.add(h.trackId);
    ids.add(titleKey(h));
  }
  for (const t of usePlayerStore.getState().queue.tracks) {
    ids.add(t.id);
    ids.add(titleKey(t));
  }
  return ids;
}

async function pickSet(kind: DjSegmentKind): Promise<Track[]> {
  const recent = recentlyPlayed();
  const known = knownTracks().filter(allowed);
  let pool: Track[] = [];
  if (kind === 'favourites') {
    const loved = known
      .filter((t) => trackScore(t.id) > 0.5)
      .sort((a, b) => trackScore(b.id) - trackScore(a.id))
      .slice(0, 20);
    const artist = shuffle(topArtists(5))[0];
    pool = [...shuffle(loved).slice(0, 3), ...(artist ? shuffle(await search(artist)) : [])];
  } else if (kind === 'throwback') {
    // Songs you liked before but haven't played lately.
    pool = shuffle(known.filter((t) => trackScore(t.id) > 0.2 && !recent.has(t.id)));
  } else if (kind === 'discover') {
    pool = shuffle(discoveryPool());
    if (pool.length < SET_SIZE && isGroqConfigured()) {
      pool.push(
        ...(await resolveSuggestions(
          await askGroqForSongs(
            `Discovery for this listener (${tasteSummary()}): artists they have never played, same languages and mood.`,
            7,
            0.9,
          ),
        )),
      );
    }
  } else {
    const t = timeOfDay();
    if (isGroqConfigured()) {
      pool = await resolveSuggestions(
        await askGroqForSongs(
          `Songs for ${t.label} right now for this listener (${tasteSummary() || 'new listener'}). Match the time of day energy.`,
          7,
          0.85,
        ),
      );
    }
    if (pool.length < SET_SIZE)
      pool.push(...shuffle(await search(`${topGenres(1)[0] ?? 'chill'} ${t.label}`)));
  }
  const set = diversify(pool, SET_SIZE, 2, recent);
  if (set.length >= 3 || kind === 'favourites') return set;
  return pickSet('favourites'); // not enough for this set: fall back to what they love
}

/** Personal fallback lines (no AI needed). */
function templateLine(kind: DjSegmentKind, first: Track): string {
  const name = useProfileStore.getState().profile?.name?.split(/\s+/)[0] ?? '';
  const hi = name ? `${name}, ` : '';
  const t = timeOfDay();
  const streak = liveStreak(useStreakStore.getState());
  switch (kind) {
    case 'favourites':
      return `${hi}${t.hindi} ka time hai, toh shuru karte hain tere favourites se. Pehla gaana, ${first.title}.`;
    case 'discover':
      return `Ab kuch naya. Yeh artists tune abhi tak nahi sune, par mujhe lagta hai pasand aayenge. Starting with ${first.artist}.`;
    case 'throwback':
      return `Thoda peeche chalte hain. Yeh gaane tune kaafi time se nahi sune. ${first.title}, yaad hai?`;
    case 'mood':
      return `${streak >= 3 ? `${streak} din ki streak, nice! ` : ''}Is ${t.hindi} ke mood ke liye, ${first.title} by ${first.artist}.`;
  }
}

async function lineFor(kind: DjSegmentKind, set: Track[]): Promise<string> {
  const first = set[0];
  if (!first) return '';
  if (isGroqConfigured()) {
    const name = useProfileStore.getState().profile?.name?.split(/\s+/)[0] ?? '';
    const now = new Date();
    const time = now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const streak = liveStreak(useStreakStore.getState());
    const line = await askGroqLine(
      `Introduce the next set to ${name || 'the listener'}. It is ${time}.
Set: ${LABEL[kind]} (${kind === 'favourites' ? 'songs they love' : kind === 'discover' ? 'artists they never played' : kind === 'throwback' ? 'songs they loved but have not played lately' : `songs for this ${timeOfDay().label}`}).
First song: ${first.title} by ${first.artist}. Next: ${set
        .slice(1, 3)
        .map((t) => `${t.title} by ${t.artist}`)
        .join(', ')}.
What you know about them: ${tasteSummary() || 'new listener'}${streak >= 3 ? `; ${streak}-day listening streak` : ''}.
Name the first song. Be warm and specific to them.`,
    );
    if (line) return line;
  }
  return templateLine(kind, first);
}

function nextKind(after: DjSegmentKind | null, skip?: DjSegmentKind): DjSegmentKind {
  let i = after ? (ORDER.indexOf(after) + 1) % ORDER.length : 0;
  if (ORDER[i] === skip) i = (i + 1) % ORDER.length;
  return ORDER[i] as DjSegmentKind;
}

/** Build a set and remember its intro line for when its first song starts. */
async function buildSet(kind: DjSegmentKind): Promise<Track[]> {
  const set = await pickSet(kind);
  if (set.length === 0) return [];
  const line = useDjStore.getState().voice ? await lineFor(kind, set) : '';
  const first = set[0] as Track;
  intros.set(first.id, { line, kind });
  for (const t of set) djTracks.add(t.id);
  lastKind = kind;
  return set;
}

export function isDjActive(): boolean {
  return useDjStore.getState().active;
}

/** Start the DJ: first set plays right away. */
export async function startDJ(): Promise<void> {
  if (isJamGuest()) throw new Error('The DJ is off while you’re in someone’s Jam.');
  useDjStore.setState({ busy: true });
  try {
    intros.clear();
    djTracks.clear();
    lastKind = null;
    const set = await buildSet('favourites');
    if (set.length === 0) throw new Error('Play a few songs first, so the DJ knows what you like.');
    useDjStore.setState({ active: true, segment: { kind: 'favourites', label: LABEL.favourites } });
    await playQueue(set, 0);
  } finally {
    useDjStore.setState({ busy: false });
  }
}

/** "Switch it up": jump to a different kind of set now. */
export async function switchItUp(): Promise<void> {
  if (!isDjActive() || useDjStore.getState().busy) return;
  djStopSpeaking();
  useDjStore.setState({ busy: true });
  try {
    const kind = nextKind(lastKind, lastKind ?? undefined);
    const set = await buildSet(kind);
    if (set.length === 0) return;
    await playQueue(set, 0);
  } finally {
    useDjStore.setState({ busy: false });
  }
}

export function stopDJ(): void {
  djStopSpeaking();
  intros.clear();
  djTracks.clear();
  useDjStore.setState({ active: false, segment: null });
}

/** Autoplay hook: while the DJ is on, the next set instead of normal radio. */
export async function djNextSet(): Promise<Track[]> {
  if (!isDjActive()) return [];
  return buildSet(nextKind(lastKind));
}

let started = false;

/** Started once from the root layout: talks when a set starts, ends DJ mode when the user takes over. */
export function startDJWatcher(): void {
  if (started) return;
  started = true;
  usePlayerStore.subscribe((s, prev) => {
    if (!isDjActive()) return;
    const track = currentTrack(s.queue);
    if (!track) return;
    // The user played something the DJ didn't pick: hand control back.
    if (!djTracks.has(track.id)) {
      stopDJ();
      return;
    }
    const intro = intros.get(track.id);
    if (
      intro &&
      s.status === 'playing' &&
      (prev.status !== 'playing' || currentTrack(prev.queue)?.id !== track.id)
    ) {
      intros.delete(track.id);
      useDjStore.setState({ segment: { kind: intro.kind, label: LABEL[intro.kind] } });
      // Let the song's intro breathe for a moment, then talk over it.
      if (intro.line && useDjStore.getState().voice)
        setTimeout(() => void djSpeak(intro.line), 1_200);
    }
  });
}
