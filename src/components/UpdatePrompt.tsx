import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { checkForUpdate, currentVersion, type AppRelease } from '@/lib/updates';
import { radius, spacing, type, useTheme } from './theme';

const LATER_KEY = 'soniq:update-later';
/** After "Later", ask again for the same version only after this long. */
const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** Optional-update popup: shown on app start when a newer APK is published. */
export function UpdatePrompt() {
  const { colors } = useTheme();
  const [release, setRelease] = useState<AppRelease | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await checkForUpdate();
      if (!found || cancelled) return;
      try {
        const later = JSON.parse((await AsyncStorage.getItem(LATER_KEY)) ?? 'null') as {
          version: string;
          at: number;
        } | null;
        if (later?.version === found.version && Date.now() - later.at < REMIND_AFTER_MS) return;
      } catch {
        // show it
      }
      if (!cancelled) setRelease(found);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!release) return null;

  const later = () => {
    void AsyncStorage.setItem(LATER_KEY, JSON.stringify({ version: release.version, at: Date.now() }));
    setRelease(null);
  };
  const download = () => {
    void Linking.openURL(release.apkUrl);
    setRelease(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={later}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.title}>
            <Ionicons name="sparkles" size={22} color={colors.accent} />
            <Text style={[type.heading, { color: colors.text }]}>New update available</Text>
          </View>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            {currentVersion()} → {release.version}
          </Text>
          {release.notes ? (
            <ScrollView style={styles.notes}>
              <Text style={[type.body, { color: colors.text }]}>{release.notes}</Text>
            </ScrollView>
          ) : null}
          <Text style={[type.caption, { color: colors.textMuted }]}>
            Optional. You can keep using this version.
          </Text>
          <View style={styles.buttons}>
            <Pressable onPress={later} accessibilityRole="button" style={[styles.button, { backgroundColor: colors.surfaceHigh }]}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>Later</Text>
            </Pressable>
            <Pressable onPress={download} accessibilityRole="button" style={[styles.button, { backgroundColor: colors.accent }]}>
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Download</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.page },
  card: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notes: { maxHeight: 220 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  button: { flex: 1, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
