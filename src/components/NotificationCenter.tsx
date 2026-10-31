import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { askNotificationPermission, notificationsModule, urlOf } from '@/lib/notifications';
import { useNotifyStore } from '@/store/notifyStore';
import { useProfileStore } from '@/store/profileStore';
import { showSheet } from './Sheet';

/** Plays before we offer notifications (so there's something personal to send). */
const ASK_AFTER_PLAYS = 10;

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

  useEffect(() => {
    if (asked || enabled || plays < ASK_AFTER_PLAYS) return;
    const t = setTimeout(() => {
      const store = useNotifyStore.getState();
      if (store.asked || store.enabled) return;
      store.setAsked();
      showSheet(
        'Want a heads-up? 🎧',
        'Your Daily Mixes, a weekly recap of what you listened to, and a nudge before your streak breaks. Sent at the time you usually listen.',
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
