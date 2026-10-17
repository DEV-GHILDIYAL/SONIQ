import { ScrollView, StyleSheet } from 'react-native';
import { JamPanel } from '@/components/JamPanel';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CONTENT_BOTTOM_PADDING } from '@/components/theme';

export default function JamScreen() {
  return (
    <Screen>
      <ScreenHeader title="Jam" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <JamPanel />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: CONTENT_BOTTOM_PADDING },
});
