import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { showSheet } from '@/components/Sheet';
import { useTheme } from '@/components/theme';
import { parsePairToken } from '@/lib/devices';
import { confirmPairing } from '@/lib/pairConfirm';
import { useProfileStore } from '@/store/profileStore';

/**
 * soniq://pair/<token>: the PC's QR scanned with the phone's own camera app.
 * Same confirmation as scanning inside SONIQ.
 */
export default function PairLinkScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const signedIn = useProfileStore((s) => !!s.profile);

  useEffect(() => {
    const done = () => (router.canGoBack() ? router.back() : router.replace('/'));
    const t = parsePairToken(String(token ?? ''));
    if (!t || !signedIn) {
      showSheet(
        !t ? 'Not a SONIQ code' : 'Create your account first',
        !t ? undefined : 'Then scan the QR on your PC again.',
      );
      done();
      return;
    }
    confirmPairing(t, done);
  }, [token, signedIn, router]);

  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
