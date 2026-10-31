/**
 * AI playlists: describe a vibe ("barish mein long drive, 90s Bollywood") and get a named
 * playlist. Groq picks the songs (optionally leaning on the listener's OWN taste), each is
 * looked up with the normal search, de-duplicated and filtered (not interested / blocked).
 */
import type { Track } from '@/sources/types';
import { usePlaylistStore, type Playlist } from '@/store/playlistStore';
import { askGroqPlaylist, askGroqForSongs, isGroqConfigured } from './groq';
import { diversify, resolveSuggestionsDetailed, tasteSummary } from './recommendations';
import { titleKey, withoutTasteSignals } from './taste';

export const AI_PLAYLIST_SIZE = 25;
const ADD_SIMILAR = 10;

export const AI_PRESETS: { label: string; prompt: string }[] = [
  { label: '💪 Gym', prompt: 'High-energy workout songs to push through the last set' },
  { label: '🚗 Road trip', prompt: 'Feel-good road trip songs everyone sings along to' },
  { label: '🌙 Late night', prompt: 'Calm late-night songs for 2 AM thoughts' },
  { label: '📚 Study', prompt: 'Focus music for studying, mostly instrumental or soft vocals' },
  { label: '💔 Heartbreak', prompt: 'Heartbreak songs for when it hurts but you want to feel it' },
  { label: '🌧️ Barish', prompt: 'Rainy day songs, cosy and a little romantic' },
  { label: '🎉 Party', prompt: 'Party bangers, Bollywood and Punjabi, non-stop dance' },
  { label: '📼 90s', prompt: '90s Bollywood classics everyone grew up with' },
];

export interface DraftSong {
  track: Track;
  reason?: string;
}

export interface AiDraft {
  prompt: string;
  name: string;
  description: string;
  songs: DraftSong[];
}

export class AiUnavailableError extends Error {}

function buildTask(
  prompt: string,
  personal: boolean,
  previous?: DraftSong[],
  tweak?: string,
): string {
  const parts = [`Playlist request: "${prompt.trim().slice(0, 300)}".`];
  if (personal) {
    const taste = tasteSummary();
    if (taste)
      parts.push(
        `Listener profile (from their own listening): ${taste}. Lean towards their languages and artists, but the request comes first.`,
      );
  }
  if (previous?.length && tweak) {
    parts.push(
      `Current playlist: ${previous
        .slice(0, 30)
        .map((s) => `${s.track.title} - ${s.track.artist}`)
        .join('; ')}.`,
      `Change it like this: "${tweak.trim().slice(0, 200)}". Keep the songs that still fit, replace the rest.`,
    );
  }
  return parts.join('\n');
}

/** Generate (or tweak) a playlist draft. `onProgress` reports song lookups (done, total). */
export async function generatePlaylist(
  prompt: string,
  opts: { personal: boolean; previous?: DraftSong[]; tweak?: string },
  onProgress?: (done: number, total: number) => void,
): Promise<AiDraft> {
  if (!isGroqConfigured())
    throw new AiUnavailableError('AI is offline right now. Try again later.');
  const answer = await askGroqPlaylist(
    buildTask(prompt, opts.personal, opts.previous, opts.tweak),
    AI_PLAYLIST_SIZE,
  );
  if (!answer)
    throw new AiUnavailableError('The AI didn’t answer. Check your internet and try again.');
  const resolved = await resolveSuggestionsDetailed(answer.songs, onProgress);
  const reasons = new Map(resolved.map((r) => [r.track.id, r.suggestion.reason]));
  const tracks = diversify(
    resolved.map((r) => r.track),
    AI_PLAYLIST_SIZE,
    4,
  );
  if (tracks.length === 0) throw new Error('Couldn’t find these songs right now. Try again.');
  return {
    prompt,
    name: answer.name,
    description: answer.description,
    songs: tracks.map((t) => ({ track: t, reason: reasons.get(t.id) })),
  };
}

/** One new song for the slot of a removed/replaced song (not already in the draft). */
export async function replacementFor(draft: AiDraft, personal: boolean): Promise<DraftSong | null> {
  const list = await askGroqForSongs(
    `${buildTask(draft.prompt, personal)}\nAlready in the playlist: ${draft.songs
      .map((s) => `${s.track.title} - ${s.track.artist}`)
      .join('; ')}. Suggest different songs that fit.`,
    4,
    0.95,
  );
  const have = new Set(draft.songs.flatMap((s) => [s.track.id, titleKey(s.track)]));
  for (const r of await resolveSuggestionsDetailed(list)) {
    if (!have.has(r.track.id) && !have.has(titleKey(r.track)))
      return { track: r.track, reason: r.suggestion.reason };
  }
  return null;
}

/** Save a draft as a new (private) playlist in the library. */
export function saveDraft(draft: AiDraft, name: string): Playlist {
  return usePlaylistStore.getState().importPlaylist(
    name.trim() || draft.name,
    draft.songs.map((s) => s.track),
  );
}

/** "✨ Add similar": up to 10 songs that fit an existing playlist. Returns how many were added. */
export async function addSimilarSongs(playlistId: string): Promise<number> {
  if (!isGroqConfigured())
    throw new AiUnavailableError('AI is offline right now. Try again later.');
  const playlist = usePlaylistStore.getState().playlists.find((p) => p.id === playlistId);
  if (!playlist) throw new Error('Playlist not found.');
  if (playlist.tracks.length === 0)
    throw new Error('Add a few songs first, then AI can find similar ones.');
  const sample = [...playlist.tracks].sort(() => Math.random() - 0.5).slice(0, 20);
  const list = await askGroqForSongs(
    `Playlist "${playlist.name}" has: ${sample.map((t) => `${t.title} - ${t.artist}`).join('; ')}.
Suggest songs that fit this playlist's vibe, language and era. Not already in it. Max 2 per artist.`,
    ADD_SIMILAR + 4,
    0.85,
  );
  const have = new Set(playlist.tracks.flatMap((t) => [t.id, titleKey(t)]));
  const fresh = diversify(
    (await resolveSuggestionsDetailed(list)).map((r) => r.track),
    ADD_SIMILAR,
    2,
    have,
  );
  // AI picked these, not the user: don't count them as "added to playlist" taste signals.
  return withoutTasteSignals(() => usePlaylistStore.getState().addTracks(playlistId, fresh));
}
