/**
 * The AI DJ's voice: the phone's own text-to-speech (best installed Indian-English voice),
 * with the music ducked while it talks. Kept in src/player/ because it controls audio.
 * Built so a realistic cloud / self-hosted voice can replace `speakWithDevice` later.
 */
import { setDucked } from './engine';

type SpeechModule = typeof import('expo-speech');
let mod: SpeechModule | null | undefined;
let chosenVoice: string | null | undefined;

function S(): SpeechModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-speech') as SpeechModule;
  } catch {
    mod = null;
  }
  return mod;
}

/** Best voice on this phone: Indian English (enhanced first), then Hindi, then English. */
async function pickVoice(): Promise<string | null> {
  if (chosenVoice !== undefined) return chosenVoice;
  const s = S();
  try {
    const voices = (await s?.getAvailableVoicesAsync()) ?? [];
    const score = (v: (typeof voices)[number]) => {
      const lang = v.language.toLowerCase().replace('_', '-');
      let n = 0;
      if (lang === 'en-in') n += 50;
      else if (lang === 'hi-in') n += 35;
      else if (lang.startsWith('en-')) n += 20;
      else return -1;
      if (String(v.quality) === 'Enhanced') n += 20;
      if (/network/i.test(v.identifier)) n += 5; // Google's online neural voices sound better
      return n;
    };
    const best = voices.map((v) => [v, score(v)] as const).sort((a, b) => b[1] - a[1])[0];
    chosenVoice = best && best[1] >= 0 ? best[0].identifier : null;
  } catch {
    chosenVoice = null;
  }
  return chosenVoice;
}

let speaking = false;

export function isDjSpeaking(): boolean {
  return speaking;
}

/** Say `text` over ducked music. Resolves when done (or after a safety timeout). */
export async function djSpeak(text: string): Promise<void> {
  const s = S();
  if (!s || !text.trim()) return;
  if (speaking) await s.stop().catch(() => undefined);
  const voice = await pickVoice();
  speaking = true;
  setDucked(true);
  await new Promise<void>((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    // ~14 chars per second, plus margin, in case the engine never reports back.
    const safety = setTimeout(done, Math.max(6_000, text.length * 90));
    s.speak(text, {
      language: 'en-IN',
      voice: voice ?? undefined,
      rate: 1.0,
      pitch: 1.0,
      onDone: () => {
        clearTimeout(safety);
        done();
      },
      onStopped: () => {
        clearTimeout(safety);
        done();
      },
      onError: () => {
        clearTimeout(safety);
        done();
      },
    });
  });
  speaking = false;
  setDucked(false);
}

export function djStopSpeaking(): void {
  const s = S();
  if (!s) return;
  void s.stop().catch(() => undefined);
  speaking = false;
  setDucked(false);
}
