/**
 * "New SONIQ update" notification, without any background-task native module (v1.6.5 used
 * expo-background-task and crashed on launch after updating). While SONIQ runs in the
 * background (music playing keeps it alive) it checks GitHub Releases every few hours and
 * notifies once per new version. Inside the app the update popup covers it.
 */
import { AppState, Platform } from 'react-native';
import { useNotifyStore } from '@/store/notifyStore';
import { showNow } from './notifications';
import { checkForUpdate, parseNotes } from './updates';

const EVERY_MS = 3 * 60 * 60 * 1000;

/** Check once; notify if a newer version is out and we haven't told the user yet. */
export async function notifyIfUpdate(): Promise<boolean> {
  const release = await checkForUpdate();
  if (!release || useNotifyStore.getState().updateNotified === release.version) return false;
  const notes = parseNotes(release.notes);
  const shown = await showNow(
    {
      kind: 'updates',
      title: `SONIQ v${release.version} is here 🚀`,
      body: notes.tagline ?? notes.items[0] ?? 'Tap to see what’s new and update.',
      url: '/about',
    },
    'updates',
  );
  if (shown) useNotifyStore.getState().setUpdateNotified(release.version);
  return shown;
}

let started = false;
let lastCheck = 0;

/** Started once from the root layout. Never throws. */
export function startUpdateCheck(): void {
  if (started || Platform.OS !== 'android') return;
  started = true;
  const tick = () => {
    // On screen the in-app popup handles updates; notify only from the background.
    if (AppState.currentState === 'active' || Date.now() - lastCheck < EVERY_MS) return;
    lastCheck = Date.now();
    void notifyIfUpdate().catch(() => undefined);
  };
  setInterval(tick, EVERY_MS);
  AppState.addEventListener('change', (state) => {
    if (state === 'background') setTimeout(tick, 60_000);
  });
}
