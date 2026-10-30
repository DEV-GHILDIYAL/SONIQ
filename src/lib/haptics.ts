/** Small vibrations for key actions. Respects Settings > Haptics; never throws. */
import { useSettingsStore } from '@/store/settingsStore';

type HapticsModule = typeof import('expo-haptics');
let mod: HapticsModule | null | undefined;

function load(): HapticsModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-haptics') as HapticsModule;
  } catch {
    mod = null; // native module missing (tests / old build)
  }
  return mod;
}

const enabled = () => useSettingsStore.getState().haptics;

/** Buttons: play/pause, skip, like. */
export function tapHaptic(): void {
  const h = load();
  if (!h || !enabled()) return;
  void h.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Long-press menus and swipe commits. */
export function pressHaptic(): void {
  const h = load();
  if (!h || !enabled()) return;
  void h.impactAsync(h.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Something finished well (joined a Jam, download done). */
export function successHaptic(): void {
  const h = load();
  if (!h || !enabled()) return;
  void h.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {});
}
