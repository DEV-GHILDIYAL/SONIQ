/**
 * "New SONIQ update" notification. Android wakes this up every few hours in the background
 * (WorkManager via expo-background-task, the OS decides the exact time), it checks GitHub
 * Releases and notifies once per new version. Tapping it opens About, which offers the update.
 *
 * Must be imported from the root layout so the task is defined when Android starts the JS
 * in the background.
 */
import { useNotifyStore } from '@/store/notifyStore';
import { showNow } from './notifications';
import { checkForUpdate, parseNotes } from './updates';

const TASK = 'soniq-update-check';
/** Minutes between checks (a minimum; Android may run it later). */
const EVERY_MIN = 6 * 60;

type TaskManagerModule = typeof import('expo-task-manager');
type BackgroundTaskModule = typeof import('expo-background-task');

function load(): { tm: TaskManagerModule; bg: BackgroundTaskModule } | null {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    return {
      tm: require('expo-task-manager') as TaskManagerModule,
      bg: require('expo-background-task') as BackgroundTaskModule,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    return null; // native module missing (tests / old build)
  }
}

/** Check once; notify if a newer version is out and we haven't told the user yet. */
export async function notifyIfUpdate(): Promise<boolean> {
  // In the background the stores may not have loaded from disk yet.
  if (!useNotifyStore.persist.hasHydrated()) await useNotifyStore.persist.rehydrate();
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

const mods = load();

// Defined at load time (also when Android runs only the background task).
mods?.tm.defineTask(TASK, async () => {
  try {
    await notifyIfUpdate();
    return mods.bg.BackgroundTaskResult.Success;
  } catch {
    return mods.bg.BackgroundTaskResult.Failed;
  }
});

/** Started once from the root layout: make sure the periodic check is registered. */
export function startUpdateCheck(): void {
  if (!mods) return;
  void (async () => {
    try {
      if (!(await mods.tm.isTaskRegisteredAsync(TASK))) {
        await mods.bg.registerTaskAsync(TASK, { minimumInterval: EVERY_MIN });
      }
    } catch {
      // background tasks unavailable on this phone: the in-app popup still works
    }
  })();
}
