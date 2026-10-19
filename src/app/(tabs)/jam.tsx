import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { IconButton } from '@/components/IconButton';
import { JamPanel } from '@/components/JamPanel';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { showSheet } from '@/components/Sheet';
import { CONTENT_BOTTOM_PADDING } from '@/components/theme';
import { joinJam } from '@/jam/session';
import { CODE_LENGTH, normalizeCode } from '@/jam/sync';
import { friendsAvailable, refreshFriends } from '@/lib/friends';
import { useJamStore } from '@/store/jamStore';

export default function JamScreen() {
  const router = useRouter();
  // Opened by a Jam link: soniq://jam?code=ABC123
  const params = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    const code = normalizeCode(params.code ?? '');
    if (code.length !== CODE_LENGTH) return;
    router.setParams({ code: '' });
    const jam = useJamStore.getState();
    if (jam.code === code && jam.status !== 'idle') return;
    showSheet('Join this Jam?', `Listen together, in sync. Code ${code}`, [
      { text: 'Join', icon: 'headset', onPress: () => void joinJam(code).catch(() => {}) },
      { text: 'Not now', style: 'cancel' },
    ]);
  }, [params.code, router]);

  // See which friends are in a public Jam.
  useFocusEffect(
    useCallback(() => {
      if (friendsAvailable()) refreshFriends().catch(() => undefined);
    }, []),
  );

  return (
    <Screen>
      <ScreenHeader
        title="Jam"
        right={
          friendsAvailable() ? (
            <View style={styles.actions}>
              <IconButton
                icon="people-outline"
                label="Friends"
                onPress={() => router.push('/friends')}
              />
            </View>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <JamPanel />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: CONTENT_BOTTOM_PADDING },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
