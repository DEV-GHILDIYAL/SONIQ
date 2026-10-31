/**
 * Groq AI Music Recommendation Engine for SONIQ.
 * Uses ultra-fast LLM inference (Llama 3.3/3.1) to intelligently suggest
 * the next best tracks matching user taste and listening context.
 */
import { env } from './env';
import { fetchJson } from './fetch';
import type { Track } from '@/sources/types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export interface AiSuggestion {
  title: string;
  artist: string;
  reason?: string;
}

interface GroqResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

function getApiKey(): string {
  // One shared key, baked in at build time (EXPO_PUBLIC_GROQ_API_KEY). Users never enter one.
  return env.groqApiKey;
}

/** Check if Groq AI is available/configured. */
export function isGroqConfigured(): boolean {
  return !!getApiKey();
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

/** One JSON-mode chat call. Returns the parsed object, or null on any failure. */
export async function askGroqJson(
  system: string,
  user: string,
  maxTokens: number,
  temperature = 0.8,
): Promise<unknown> {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  try {
    const data = await fetchJson<GroqResponse>(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      },
      timeoutMs: 20_000,
    });
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    try {
      return JSON.parse(content) as unknown;
    } catch {
      const match = /\{.*\}/s.exec(content);
      return match ? (JSON.parse(match[0]) as unknown) : null;
    }
  } catch (err) {
    if (__DEV__) console.warn('[groq] request failed:', err);
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

/** A short spoken line for the AI DJ (plain text, no emojis). Null on failure. */
export async function askGroqLine(task: string): Promise<string | null> {
  const parsed = (await askGroqJson(
    'You are SONIQ DJ, a warm, witty radio DJ from Mumbai who talks to ONE listener like a friend. ' +
      'Speak natural Hinglish (Hindi words written in English letters, mixed with English). ' +
      'Max 2 short sentences, under 30 words. No emojis, no hashtags, no quotes around song names. ' +
      'Reply ONLY with JSON: {"line": "..."}.',
    task,
    120,
    0.9,
  )) as { line?: unknown } | null;
  const line =
    typeof parsed?.line === 'string'
      ? parsed.line.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()
      : '';
  return line ? line.slice(0, 240) : null;
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
