import { showSheet } from '@/components/Sheet';
import { approvePairing } from './devices';

/**
 * Ask before linking the PC that showed this QR to the user's account (a QR from someone
 * else's screen would hand them your account), then approve it.
 */
export function confirmPairing(token: string, onFinished: () => void): void {
  showSheet(
    'Link this PC to your account?',
    'Only do this for a PC in front of you. It gets your liked songs, playlists and friends, and stays signed in until you remove it.',
    [
      {
        text: 'Link PC',
        icon: 'laptop-outline',
        onPress: () =>
          void approvePairing(token)
            .then((name) => {
              showSheet('Linked ✅', `${name} is now signed in to your SONIQ account.`);
              onFinished();
            })
            .catch((err: unknown) => {
              showSheet("Couldn't link", err instanceof Error ? err.message : String(err));
              onFinished();
            }),
      },
      { text: 'Cancel', style: 'cancel', onPress: onFinished },
    ],
  );
}
