/**
 * The AI DJ's voice, with the music ducked while it talks. Kept in src/player/ because it
 * controls audio. Natural voice (Sarvam AI, see lib/djTts) first when chosen; the phone's
 * own text-to-speech (best installed Indian-English voice) when that's off or unavailable.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { naturalVoiceFile } from '@/lib/djTts';
import { useDjStore, type DjLine } from '@/store/djStore';
import { usePlayerStore } from '@/store/playerStore';
import { resume, setDucked } from './engine';

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
/** Ends the natural-voice line now playing (if any). */
let endVoice: (() => void) | null = null;
/** Bumped per line, so a line that was cut off doesn't undo the next one's ducking. */
let lineId = 0;

/** Play a spoken line from a file. Resolves when it ends (or after a safety timeout). */
function playVoiceFile(uri: string, approxSec: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let finished = false;
    const p: AudioPlayer = createAudioPlayer({ uri });
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      sub.remove();
      try {
        p.remove();
      } catch {
        // already released
      }
      if (endVoice === done) endVoice = null;
      resolve();
    };
    endVoice = done;
    const safety = setTimeout(done, Math.max(8_000, approxSec * 1_000 + 4_000));
    const sub = p.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) done();
    });
    p.play();
  });
}

export function isDjSpeaking(): boolean {
  return speaking;
}

/** Say `text` over ducked music. Resolves when done (or after a safety timeout). */
export async function djSpeak(line: DjLine): Promise<void> {
  const text = line.text;
  if (!text.trim()) return;
  if (speaking) djStopSpeaking();
  const wasPlaying = usePlayerStore.getState().status === 'playing';

  const id = ++lineId;

  if (useDjStore.getState().voiceStyle === 'natural') {
    const file = await naturalVoiceFile(line);
    if (id !== lineId) return; // a newer line (or stop) came in while fetching
    if (file) {
      speaking = true;
      setDucked(true);
      await playVoiceFile(file, text.length / 14);
      if (id !== lineId) return;
      speaking = false;
      setDucked(false);
      // Some phones pause the song when a second sound starts: carry on playing.
      if (wasPlaying && usePlayerStore.getState().status === 'paused') resume();
      return;
    }
  }
  await speakWithDevice(text, line.lang);
}

/** The phone's own text-to-speech. */
async function speakWithDevice(text: string, lang: DjLine['lang']): Promise<void> {
  const s = S();
  if (!s) return;
  // Hindi lines (Devanagari) need a Hindi voice; the best English voice can't read them.
  const voice = lang === 'hi' ? null : await pickVoice();
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
      language: lang === 'hi' ? 'hi-IN' : 'en-IN',
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
  lineId++;
  endVoice?.();
  void S()
    ?.stop()
    .catch(() => undefined);
  speaking = false;
  setDucked(false);
}
