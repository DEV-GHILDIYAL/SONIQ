/**
 * Natural DJ voice (Sarvam AI "Bulbul", Hindi / Hinglish) through the `tts` Edge Function.
 * The Sarvam key stays on the server. Built to make the shared credit last:
 *  - each line is cached on the phone by its text (same line = no new call),
 *  - when the credit runs out or the server is down, we stop asking for a while
 *    and the DJ uses the phone's own voice instead,
 *  - the server also caps characters per user per day.
 * Returns a local file:// URI to play, or null (caller falls back to the phone voice).
 */
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { DjLine } from '@/store/djStore';
import { useProfileStore } from '@/store/profileStore';
import { getSupabase, supabaseConfigured } from './supabase';

const DIR = 'dj-voice';
/** Keep at most this many spoken lines on the phone. */
const MAX_CACHED = 40;
/** After "out of credit" / "not configured": try again after this long. */
const PAUSE_NO_CREDIT_MS = 6 * 60 * 60 * 1000;
/** After the daily limit: try again tomorrow-ish. */
const PAUSE_LIMIT_MS = 3 * 60 * 60 * 1000;
/** After a network / server blip. */
const PAUSE_ERROR_MS = 5 * 60 * 1000;

let pausedUntil = 0;

function dir(): Directory {
  const d = new Directory(Paths.cache, DIR);
  d.create({ intermediates: true, idempotent: true });
  return d;
}

/** Drop the oldest lines so the cache stays small. */
function trimCache(d: Directory): void {
  try {
    const files = d
      .list()
      .filter((f): f is File => f instanceof File)
      .sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
    for (const f of files.slice(0, Math.max(0, files.length - MAX_CACHED))) f.delete();
  } catch {
    // cache cleanup is best effort
  }
}

export async function naturalVoiceFile(dj: DjLine): Promise<string | null> {
  const line = dj.text.replace(/\s+/g, ' ').trim();
  const profile = useProfileStore.getState().profile;
  if (!line || line.length > 240 || !profile || !supabaseConfigured()) return null;

  const d = dir();
  const name = (
    await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${dj.lang}|${dj.energy}|${line}`,
    )
  ).slice(0, 32);
  const cached = new File(d, `${name}.mp3`);
  if (cached.exists && (cached.size ?? 0) > 0) return cached.uri;

  if (Date.now() < pausedUntil) return null;
  try {
    const { data, error } = await getSupabase().functions.invoke<{ audio?: string }>('tts', {
      body: {
        id: profile.id,
        secret: profile.secret,
        text: line,
        lang: dj.lang,
        energy: dj.energy,
      },
    });
    if (error || !data?.audio) {
      const ctx = (error as { context?: Response } | null)?.context;
      const status = ctx?.status;
      const reason = await ctx
        ?.clone()
        .json()
        .then((b: { error?: string }) => b.error ?? '')
        .catch(() => '');
      pausedUntil =
        Date.now() +
        (reason === 'voice credit' || reason === 'voice not configured'
          ? PAUSE_NO_CREDIT_MS
          : status === 429
            ? PAUSE_LIMIT_MS
            : PAUSE_ERROR_MS);
      if (__DEV__) console.warn('[dj-voice] unavailable:', status, error?.message);
      return null;
    }
    cached.create({ overwrite: true });
    cached.write(data.audio, { encoding: 'base64' });
    trimCache(d);
    return cached.exists && (cached.size ?? 0) > 0 ? cached.uri : null;
  } catch (err) {
    pausedUntil = Date.now() + PAUSE_ERROR_MS;
    if (__DEV__) console.warn('[dj-voice] request failed:', err);
    return null;
  }
}
