import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import {
  askNotificationPermission,
  notificationsAllowed,
  notificationsModule,
  urlOf,
} from '@/lib/notifications';
import { useNotifyStore } from '@/store/notifyStore';
import { useProfileStore } from '@/store/profileStore';
import { showSheet } from './Sheet';

/** Offer notifications after the first song (friend requests + updates need them early). */
const ASK_AFTER_PLAYS = 1;

/** Opens the right screen for a tapped notification, and offers notifications once. */
export function NotificationCenter() {
  const router = useRouter();
  const plays = useProfileStore((s) => s.plays);
  const asked = useNotifyStore((s) => s.asked);
  const enabled = useNotifyStore((s) => s.enabled);

  useEffect(() => {
    const n = notificationsModule();
    if (!n) return;
    const open = (url: string | null) => {
      if (url) setTimeout(() => router.push(url as Href), 300);
    };
    // App was started by tapping a notification.
    void n
      .getLastNotificationResponseAsync()
      .then((r) => r && open(urlOf(r)))
      .catch(() => undefined);
    const sub = n.addNotificationResponseReceivedListener((r) => open(urlOf(r)));
    return () => sub.remove();
  }, [router]);

  // Never decided, but Android already allows SONIQ's notifications: turn them on once.
  // (After that the Settings switch is the user's call.)
  useEffect(() => {
    if (enabled || asked) return;
    void notificationsAllowed().then((ok) => {
      if (!ok) return;
      const store = useNotifyStore.getState();
      store.setAsked();
      store.setEnabled(true);
    });
  }, [enabled, asked]);

  useEffect(() => {
    if (asked || enabled || plays < ASK_AFTER_PLAYS) return;
    const t = setTimeout(() => {
      const store = useNotifyStore.getState();
      if (store.asked || store.enabled) return;
      store.setAsked();
      showSheet(
        'Want a heads-up? 🎧',
        'Friend requests, new SONIQ updates, your Daily Mixes and a nudge before your streak breaks. Reminders come at the time you usually listen.',
        [
          {
            text: 'Turn on',
            icon: 'notifications-outline',
            onPress: () =>
              void askNotificationPermission().then((ok) => {
                useNotifyStore.getState().setEnabled(ok);
                if (!ok)
                  showSheet(
                    'Notifications are off',
                    'You can allow them later in Settings › Notifications.',
                  );
              }),
          },
          { text: 'Not now', style: 'cancel' },
        ],
      );
    }, 4_000);
    return () => clearTimeout(t);
  }, [asked, enabled, plays]);

  return null;
}
