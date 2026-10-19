import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { forgetLastJam, rejoinableJam, rejoinLastJam } from '@/jam/session';
import { useJamStore } from '@/store/jamStore';
import { showSheet } from './Sheet';

let asked = false;

/** App was closed during a Jam: offer to rejoin it (once per launch). Mounted in the root layout. */
export function JamRejoinPrompt() {
  const router = useRouter();

  useEffect(() => {
    const ask = () => {
      if (asked) return;
      asked = true;
      const last = rejoinableJam();
      if (!last) return;
      const mins = Math.max(1, Math.round((Date.now() - last.at) / 60_000));
      showSheet(
        'Rejoin your Jam?',
        last.role === 'host'
          ? `You were hosting Jam ${last.code} (${mins} min ago). Friends waiting in it will sync again.`
          : `You were listening in Jam ${last.code} (${mins} min ago).`,
        [
          {
            text: last.role === 'host' ? 'Host it again' : 'Rejoin',
            icon: 'radio',
            onPress: () => {
              router.push('/jam');
              void rejoinLastJam().catch(() => {});
            },
          },
          { text: 'No thanks', style: 'cancel', onPress: forgetLastJam },
        ],
      );
    };
    // Wait for the saved Jam to load, then a moment for the splash to finish.
    const timer = { id: null as ReturnType<typeof setTimeout> | null };
    const schedule = () => {
      timer.id = setTimeout(ask, 2500);
    };
    if (useJamStore.persist.hasHydrated()) schedule();
    const unsub = useJamStore.persist.onFinishHydration(schedule);
    return () => {
      unsub();
      if (timer.id) clearTimeout(timer.id);
    };
  }, [router]);

  return null;
}
