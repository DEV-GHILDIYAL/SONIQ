/**
 * Festival moments (Diwali for now). Everything is time-boxed: the banner, theme offer,
 * DJ wishes and the fireworks show up only around the festival and then step aside.
 * Mixes are built from the user's own sources by search, ordered by their taste.
 */
import { playQueue } from '@/player/engine';
import { searchAll } from '@/sources/registry';
import type { Track } from '@/sources/types';
import { diversify } from './recommendations';
import { allowed, trackScore } from './taste';

/** Lakshmi Puja day per year (local date). Add a line each year. */
const DIWALI: Record<number, string> = {
  2026: '2026-11-08',
  2027: '2027-10-29',
  2028: '2028-10-17',
};
/** The festive window: two days before Dhanteras … a few days after. */
const DAYS_BEFORE = 2;
const DAYS_AFTER = 4;
const DAY_MS = 86_400_000;

function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** This year's Diwali (local midnight), or null if the year isn't in the table. */
export function diwaliDate(now = new Date()): Date | null {
  const iso = DIWALI[now.getFullYear()];
  return iso ? localDate(iso) : null;
}

/** Inside the Diwali window (banner, theme offer, DJ wishes). */
export function isDiwaliSeason(now = new Date()): boolean {
  const day = diwaliDate(now);
  if (!day) return false;
  const t = now.getTime();
  return t >= day.getTime() - DAYS_BEFORE * DAY_MS && t < day.getTime() + (DAYS_AFTER + 1) * DAY_MS;
}

/** Diwali day itself (fireworks). */
export function isDiwaliDay(now = new Date()): boolean {
  const day = diwaliDate(now);
  return !!day && now.getTime() >= day.getTime() && now.getTime() < day.getTime() + DAY_MS;
}

export interface FestivalMix {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  queries: string[];
}

export const DIWALI_MIXES: readonly FestivalMix[] = [
  {
    id: 'diwali-puja',
    title: 'Puja & Aarti',
    subtitle: 'Lakshmi aarti, bhajans',
    emoji: '🪔',
    queries: [
      'Om Jai Lakshmi Mata aarti',
      'Lakshmi aarti',
      'Ganesh aarti Jai Ganesh Deva',
      'Diwali bhajan',
      'Om Jai Jagdish Hare',
    ],
  },
  {
    id: 'diwali-party',
    title: 'Diwali Party',
    subtitle: 'Bollywood bangers',
    emoji: '🎆',
    queries: [
      'Bollywood party songs',
      'Punjabi party hits',
      'Bollywood dance hits',
      'Diwali party songs',
      'Bollywood festive songs',
    ],
  },
  {
    id: 'diwali-family',
    title: 'Family Classics',
    subtitle: 'Old songs everyone sings',
    emoji: '✨',
    queries: [
      'Happy Diwali song',
      'Aayi Hai Diwali',
      'Deepavali Manayi Suhani',
      'Kabhi Khushi Kabhie Gham title song',
      'Bollywood old classic family songs',
    ],
  },
];

async function safeSearch(q: string): Promise<Track[]> {
  try {
    return (await searchAll(q, undefined, 8)).filter(allowed);
  } catch {
    return [];
  }
}

/** Build a festival mix from search (best matches first, then the user's taste) and play it. */
export async function playFestivalMix(mix: FestivalMix): Promise<number> {
  const results = await Promise.all(mix.queries.map(safeSearch));
  // Round-robin across queries so every part of the mix is represented.
  const merged: Track[] = [];
  for (let i = 0; i < 8; i++) for (const r of results) if (r[i]) merged.push(r[i] as Track);
  const loved = [...merged].sort((a, b) => trackScore(b.id) - trackScore(a.id)).slice(0, 4);
  const set = diversify([...loved, ...merged], 25, 3);
  if (set.length > 0) await playQueue(set, 0);
  return set.length;
}

/** A line the DJ can add during the festival (Hindi, Devanagari). */
export function festiveDjHint(now = new Date()): string {
  if (!isDiwaliSeason(now)) return '';
  return isDiwaliDay(now)
    ? 'Today is Diwali: open with a warm "Happy Diwali" wish.'
    : 'It is Diwali week: add a short festive touch now and then (diyas, mithai, patakhe).';
}
