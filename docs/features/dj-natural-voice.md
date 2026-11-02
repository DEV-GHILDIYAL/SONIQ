# DJ natural voice (Sarvam AI Bulbul)

- `supabase/functions/tts`: one DJ line (max 240 chars) -> Sarvam `/text-to-speech`, Hindi
  (`hi-IN`, Hinglish works), MP3 22 kHz. Key only in the `SARVAM_API_KEY` secret.
- Checks SONIQ ID + secret, then `soniq_tts_take` counts characters per user per day
  (default 2000, secret `TTS_DAILY_CHARS`). Model / speaker via `SARVAM_MODEL`
  (default `bulbul:v4-flash`) and `SARVAM_SPEAKER` (default: model's own voice).
- Errors: 429 daily limit, 401 not allowed, 503 `voice credit` (out of credit / bad key),
  503 `voice unavailable`, 504 timeout. Sarvam's reply is logged under Edge Functions > tts > Logs.
- App (`src/lib/djTts.ts`): caches each line on the phone by SHA-256 of its text (max 40 files);
  after out-of-credit stops asking for 6 h, after the daily limit 3 h, after errors 5 min.
- `src/player/djVoice.ts` plays the MP3 with a second expo-audio player over ducked music;
  falls back to expo-speech when there is no file. Resumes the song if the phone paused it.
- Settings > DJ voice: Natural / Phone voice / Off (`djStore.voiceStyle`, persisted v2).
- Groq DJ lines kept under 22 words to save characters.
- Credit runs out: put a new key with `npx supabase secrets set SARVAM_API_KEY=...`, no app update.
