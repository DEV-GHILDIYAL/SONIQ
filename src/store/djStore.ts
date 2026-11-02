import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '@/lib/appStorage';

export type DjSegmentKind = 'favourites' | 'discover' | 'throwback' | 'mood';

/** natural = Sarvam AI voice (falls back to the phone's voice), phone = phone's own voice. */
export type DjVoiceStyle = 'natural' | 'phone';

interface DjState {
  active: boolean;
  /** What's playing now (shown on the player). */
  segment: { kind: DjSegmentKind; label: string } | null;
  /** Building the next set (Switch it up / start). */
  busy: boolean;
  /** DJ talks between sets (off = music only). */
  voice: boolean;
  toggleVoice: () => void;
  voiceStyle: DjVoiceStyle;
  /** DJ on, with this voice (Settings). */
  setVoice: (style: DjVoiceStyle | 'off') => void;
}

export const useDjStore = create<DjState>()(
  persist(
    (set) => ({
      active: false,
      segment: null,
      busy: false,
      voice: true,
      toggleVoice: () => set((s) => ({ voice: !s.voice })),
      voiceStyle: 'natural',
      setVoice: (style) =>
        set(style === 'off' ? { voice: false } : { voice: true, voiceStyle: style }),
    }),
    {
      name: 'soniq:dj',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ voice: s.voice, voiceStyle: s.voiceStyle }),
      version: 2,
      // v1 had no voiceStyle: start everyone on the natural voice.
      migrate: (persisted) => ({ voiceStyle: 'natural', ...(persisted as object) }) as DjState,
    },
  ),
);
