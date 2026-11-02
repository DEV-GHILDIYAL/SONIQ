/**
 * SONIQ AI (Groq, Llama 3.3). The app never holds the Groq key: every call goes through the
 * `ai` Supabase Edge Function, which checks this device's SONIQ ID + secret and a daily
 * per-user limit before calling Groq (see supabase/functions/ai).
 */
import type { Track } from '@/sources/types';
import type { DjLine } from '@/store/djStore';
import { useProfileStore } from '@/store/profileStore';
import { getSupabase, supabaseConfigured } from './supabase';

export interface AiSuggestion {
  title: string;
  artist: string;
  reason?: string;
}

/** Why the last AI call failed (shown in Settings / error messages). */
export type AiStatus = 'ok' | 'limit' | 'offline' | 'unavailable';
let lastStatus: AiStatus = 'ok';
export const lastAiStatus = (): AiStatus => lastStatus;

/** AI needs the backend and a profile (calls are per user). */
export function isGroqConfigured(): boolean {
  return supabaseConfigured() && !!useProfileStore.getState().profile;
}

/** Turn whatever JSON the model returned into a clean list of songs. */
function parseSongs(content: string, count: number): AiSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Sometimes the array comes wrapped in text or in { "songs": [...] }.
    const match = /\[.*\]/s.exec(content);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return [];
      }
    }
  }
  const list: unknown = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null
      ? Object.values(parsed as Record<string, unknown>).find(Array.isArray)
      : [];
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (item): item is { title: string; artist: string; reason?: string } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { title?: unknown }).title === 'string' &&
        typeof (item as { artist?: unknown }).artist === 'string',
    )
    .map((item) => ({
      title: item.title.trim(),
      artist: item.artist.trim(),
      reason: typeof item.reason === 'string' ? item.reason.trim() : undefined,
    }))
    .filter((x) => x.title && x.artist)
    .slice(0, count);
}

const SYSTEM_MUSIC =
  'You are SONIQ AI, a music expert with deep knowledge of Indian (Bollywood, Punjabi, indie, regional) and international music. ' +
  'Only recommend real, released songs that are easy to find by "title artist".';

/** One JSON-mode chat call through the `ai` Edge Function. Returns the parsed object, or null. */
export async function askGroqJson(
  system: string,
  user: string,
  maxTokens: number,
  temperature = 0.8,
): Promise<unknown> {
  const profile = useProfileStore.getState().profile;
  if (!supabaseConfigured() || !profile) return null;
  try {
    const { data, error } = await getSupabase().functions.invoke<{ content?: string }>('ai', {
      body: {
        id: profile.id,
        secret: profile.secret,
        system,
        user,
        max_tokens: maxTokens,
        temperature,
      },
    });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      lastStatus = status === 429 ? 'limit' : status === undefined ? 'offline' : 'unavailable';
      if (__DEV__) console.warn('[ai] call failed:', status, error.message);
      return null;
    }
    lastStatus = 'ok';
    const content = data?.content?.trim();
    if (!content) return null;
    try {
      return JSON.parse(content) as unknown;
    } catch {
      const match = /\{.*\}/s.exec(content);
      return match ? (JSON.parse(match[0]) as unknown) : null;
    }
  } catch (err) {
    lastStatus = 'offline';
    if (__DEV__) console.warn('[ai] request failed:', err);
    return null;
  }
}

/**
 * Ask the model for `count` songs. `task` describes what to pick; the answer is always
 * a JSON object {"songs": [{title, artist, reason}]}. Never throws (returns []).
 */
export async function askGroqForSongs(
  task: string,
  count: number,
  temperature = 0.8,
): Promise<AiSuggestion[]> {
  const parsed = await askGroqJson(
    `${SYSTEM_MUSIC} Reply ONLY with JSON: {"songs": [{"title": "...", "artist": "...", "reason": "max 6 words"}]}.`,
    `${task}\nReturn exactly ${count} songs.`,
    60 * count + 100,
    temperature,
  );
  return parsed ? parseSongs(JSON.stringify(parsed), count) : [];
}

/** A whole playlist from a description: a catchy name plus songs. */
export async function askGroqPlaylist(
  task: string,
  count: number,
): Promise<{ name: string; description: string; songs: AiSuggestion[] } | null> {
  const parsed = (await askGroqJson(
    `${SYSTEM_MUSIC} You build playlists. Reply ONLY with JSON: ` +
      '{"name": "short catchy playlist name, max 4 words", "description": "one short line", ' +
      '"songs": [{"title": "...", "artist": "...", "reason": "max 6 words"}]}. ' +
      'Order songs so the playlist flows well. Max 2 songs per artist unless asked otherwise.',
    `${task}\nReturn exactly ${count} songs.`,
    55 * count + 200,
    0.85,
  )) as { name?: unknown; description?: unknown } | null;
  if (!parsed) return null;
  const songs = parseSongs(JSON.stringify(parsed), count);
  if (songs.length === 0) return null;
  return {
    name:
      typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name.trim().slice(0, 60)
        : 'AI Playlist',
    description:
      typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 140) : '',
    songs,
  };
}

const DJ_SYSTEM = [
  'You are SONIQ DJ, a confident FM radio DJ from Mumbai with attitude, talking to ONE listener.',
  'LANGUAGE follows their taste: mostly Bollywood / Hindi / Punjabi / desi artists -> speak Hindi,',
  'written in Devanagari script (keep English words like vibe, playlist, beat and song titles in English letters).',
  'Mostly English / international artists -> speak English. Mixed taste -> pick per set, switch it up now and then.',
  'ENERGY follows the songs: party, Punjabi, rap, EDM, gym -> "hype" (punchy, loud, bold, hype them up);',
  'romantic, Sufi, everyday pop -> "warm"; sad, lo-fi, late night -> "chill" (smooth, slow).',
  'Sound like a real DJ, never like an assistant: no "Hey there", no "Here is", no greetings every time.',
  'Name the first song. Max 2 short sentences, under 22 words. No emojis, hashtags or quotes.',
  'Reply ONLY with JSON: {"line": "...", "lang": "hi" or "en", "energy": "hype" or "warm" or "chill"}.',
].join(' ');

/** A short spoken line for the AI DJ (plain text, no emojis). Null on failure. */
export async function askGroqLine(task: string): Promise<DjLine | null> {
  const parsed = (await askGroqJson(DJ_SYSTEM, task, 200, 0.9)) as {
    line?: unknown;
    lang?: unknown;
    energy?: unknown;
  } | null;
  const text =
    typeof parsed?.line === 'string'
      ? parsed.line.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()
      : '';
  if (!text) return null;
  // Trust the script over the label: any Devanagari means a Hindi voice.
  const lang = /[\u0900-\u097F]/.test(text) ? 'hi' : parsed?.lang === 'hi' ? 'hi' : 'en';
  const energy = parsed?.energy === 'hype' || parsed?.energy === 'chill' ? parsed.energy : 'warm';
  return { text: text.slice(0, 200), lang, energy };
}

/**
 * Songs that flow after `seed` for this listener (autoplay).
 * `taste` is a short description built from the listener's own history.
 */
export function getGroqRecommendations(
  seed: Track,
  taste: string,
  avoid: string[],
  count = 5,
): Promise<AiSuggestion[]> {
  return askGroqForSongs(
    `Now playing: "${seed.title}" by ${seed.artist}.
Listener profile (from their own listening): ${taste || 'not much history yet'}.
Pick songs that flow naturally after the current one (similar vibe, language, era and energy) AND fit this listener.
Mix: mostly artists they love, plus one or two they have not heard. Max 2 songs per artist.
Do not include: "${seed.title}"${avoid.length ? `, or any of: ${avoid.slice(0, 25).join('; ')}` : ''}.`,
    count,
    0.7,
  );
}
