/**
 * Groq AI Music Recommendation Engine for SONIQ.
 * Uses ultra-fast LLM inference (Llama 3.3/3.1) to intelligently suggest
 * the next best tracks matching user taste and listening context.
 */
import { env } from './env';
import { fetchJson } from './fetch';
import type { Track } from '@/sources/types';
import type { PlayRecord } from '@/store/profileStore';
import { useSettingsStore } from '@/store/settingsStore';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';

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
  const custom = useSettingsStore.getState().groqApiKey;
  if (custom) return custom;
  return env.groqApiKey;
}

/** Check if Groq AI is available/configured. */
export function isGroqConfigured(): boolean {
  return !!getApiKey();
}

/**
 * Ask Groq to decide the best next tracks to play after `seed`,
 * considering the user's top genres, top artists, and recent history.
 */
export async function getGroqRecommendations(
  seed: Track,
  history: PlayRecord[],
  topArtists: string[],
  topGenres: string[],
  count = 5,
): Promise<AiSuggestion[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const recentSongs = history.slice(0, 8).map((h) => `"${h.title}" by ${h.artist}`);
  const userTaste = [
    topArtists.length ? `Top Artists: ${topArtists.slice(0, 4).join(', ')}` : '',
    topGenres.length ? `Favorite Genres: ${topGenres.slice(0, 4).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const prompt = `You are SONIQ AI, an elite music DJ and recommendation system.
The user is currently listening to: "${seed.title}" by ${seed.artist}.
User's taste profile: ${userTaste || 'Eclectic music listener'}.
Recently played: ${recentSongs.length ? recentSongs.join(', ') : 'None'}.

Task: Recommend ${count} songs that flow naturally after "${seed.title}" by ${seed.artist} (matching vibe, genre, tempo, or artist style).
Do not recommend the seed song itself.
Respond ONLY with a valid JSON array of objects with keys "title", "artist", and a short 4-word "reason".
Example format:
[
  {"title": "Song Title", "artist": "Artist Name", "reason": "matches acoustic upbeat mood"}
]`;

  try {
    const data = await fetchJson<GroqResponse>(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a music recommendation engine that strictly returns valid JSON arrays.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      },
      timeoutMs: 8000,
    });

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Sometimes models wrap array in { "songs": [...] } or { "recommendations": [...] }
      const match = /\[.*\]/s.exec(content);
      if (match) parsed = JSON.parse(match[0]);
    }

    const list: unknown =
      Array.isArray(parsed)
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
      .slice(0, count);
  } catch (err) {
    if (__DEV__) console.warn('[groq] Recommendation failed:', err);
    return [];
  }
}
