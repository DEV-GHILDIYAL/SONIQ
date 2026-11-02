// SONIQ DJ voice: turns one short DJ line into speech with Sarvam AI (Bulbul).
// The Sarvam key lives only in Supabase secrets (SARVAM_API_KEY), never in the app.
// Every call is checked (SONIQ ID + device secret) and counted against a daily per-user
// character allowance, so the shared credit lasts.
//
//   npx supabase secrets set SARVAM_API_KEY=...
//   npx supabase functions deploy tts
//
// Optional secrets (no code change needed):
//   SARVAM_MODEL    default bulbul:v4-flash (cheapest)
//   SARVAM_SPEAKER_HI  voice for Hindi lines   (default sunny_hi_reels, male, energetic)
//   SARVAM_SPEAKER_EN  voice for English lines (default varun_en_ads, male)
//   Preview voices at https://indus.sarvam.ai before changing them.
//   TTS_DAILY_CHARS default 2000 per user per day
import { createClient } from 'npm:@supabase/supabase-js@2';

const SARVAM_URL = 'https://api.sarvam.ai/text-to-speech';
const MODEL = Deno.env.get('SARVAM_MODEL') ?? 'bulbul:v4-flash';
const SPEAKER = {
  hi: Deno.env.get('SARVAM_SPEAKER_HI') ?? 'sunny_hi_reels',
  en: Deno.env.get('SARVAM_SPEAKER_EN') ?? 'varun_en_ads',
};
/** Pace + expressiveness per energy (temperature: higher = more expressive). */
const STYLE = {
  hype: { pace: 1.15, temperature: 0.9 },
  warm: { pace: 1.05, temperature: 0.7 },
  chill: { pace: 0.95, temperature: 0.6 },
} as const;
const DAILY_CHARS = Number(Deno.env.get('TTS_DAILY_CHARS') ?? '2000');
/** DJ lines are short; anything longer is a bug or abuse. */
const MAX_CHARS = 240;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const key = Deno.env.get('SARVAM_API_KEY');
  if (!key) return json(503, { error: 'voice not configured' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad request' });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const secret = typeof body.secret === 'string' ? body.secret : '';
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  const lang: 'hi' | 'en' = body.lang === 'en' ? 'en' : 'hi';
  const style = STYLE[body.energy === 'hype' || body.energy === 'chill' ? body.energy : 'warm'];
  if (!id || !secret || !text || text.length > MAX_CHARS)
    return json(400, { error: 'bad request' });

  // Who is asking, and do they have characters left today?
  const { data: left, error } = await db.rpc('soniq_tts_take', {
    p_id: id,
    p_secret: secret,
    p_chars: text.length,
    p_limit: DAILY_CHARS,
  });
  if (error) {
    if (/tts limit/i.test(error.message)) return json(429, { error: 'daily limit' });
    if (/not allowed/i.test(error.message)) return json(401, { error: 'not allowed' });
    return json(500, { error: 'server error' });
  }

  const res = await fetch(SARVAM_URL, {
    method: 'POST',
    headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      language_code: lang === 'en' ? 'en-IN' : 'hi-IN',
      model: MODEL,
      speaker: SPEAKER[lang],
      pace: style.pace,
      temperature: style.temperature,
      // Small files: a spoken line doesn't need more than 22 kHz MP3.
      speech_sample_rate: 22050,
      output_audio_codec: 'mp3',
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) {
    console.error('[tts] sarvam timeout');
    return json(504, { error: 'voice timeout' });
  }
  if (!res.ok) {
    // Shows up in Dashboard > Edge Functions > tts > Logs (never includes the key).
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.error('[tts] sarvam', res.status, detail);
    // Out of credit or bad key: tell the app to stop asking for a while.
    const outOfCredit = res.status === 403 || /quota|credit|balance|api_key/i.test(detail);
    return json(503, { error: outOfCredit ? 'voice credit' : 'voice unavailable' });
  }
  const data = (await res.json().catch(() => null)) as { audios?: string[] } | null;
  const audio = data?.audios?.[0];
  if (!audio) return json(502, { error: 'voice unavailable' });
  return json(200, { audio, format: 'mp3', left });
});
