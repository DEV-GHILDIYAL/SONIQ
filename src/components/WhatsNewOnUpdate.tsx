import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { markWhatsNewSeen, pendingWhatsNew, RELEASES } from '@/lib/whatsnew';
import { parseNotes } from '@/lib/updates';
import { useProfileStore } from '@/store/profileStore';
import { showSheet } from './Sheet';

/** After the app was updated: one "See what's new" sheet, once per version. */
export function WhatsNewOnUpdate() {
  const router = useRouter();

  useEffect(() => {
    // Wait for stores to hydrate and the splash / other prompts to settle.
    const timer = setTimeout(() => {
      const existingUser = !!useProfileStore.getState().profile;
      void pendingWhatsNew(existingUser).then((version) => {
        if (!version) return;
        const notes = parseNotes(RELEASES.find((r) => r.version === version)?.notes ?? '');
        void markWhatsNewSeen();
        showSheet(`Updated to v${version} 🎉`, notes.tagline ?? 'See what changed in this update.', [
          { text: "See what's new", icon: 'sparkles-outline', onPress: () => router.push('/about') },
          { text: 'Later', style: 'cancel' },
        ]);
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return null;
}
