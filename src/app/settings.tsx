import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showSheet } from '@/components/Sheet';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { radius, spacing, type, useTheme } from '@/components/theme';
import { isGroqConfigured } from '@/lib/groq';
import { UpdateSheet } from '@/components/UpdatePrompt';
import { checkForUpdate, type AppRelease } from '@/lib/updates';
import { ALL_SOURCE_IDS, getSource, SOURCE_LABELS } from '@/sources/registry';
import type { SourceId } from '@/sources/types';
import { useSourceHealthStore } from '@/store/sourceHealthStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useRecentStore } from '@/store/recentStore';
import { useUnavailableStore } from '@/store/unavailableStore';

type IconName = keyof typeof Ionicons.glyphMap;

const THEME_LABEL = { system: 'System default', light: 'Light', dark: 'Dark' } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[type.micro, styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  danger = false,
  last = false,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && { backgroundColor: colors.surfaceHigh },
      ]}
    >
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textMuted} />
      <Text style={[type.body, styles.label, { color: tint }]}>{label}</Text>
      {value ? <Text style={[type.caption, { color: colors.textMuted }]}>{value}</Text> : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const recentCount = useRecentStore((s) => s.tracks.length);
  const hiddenCount = useUnavailableStore((s) => s.ids.length);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const health = useSourceHealthStore((s) => s.bySource);
  const [checking, setChecking] = useState<SourceId | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateRelease, setUpdateRelease] = useState<AppRelease | null>(null);
  const groqReady = isGroqConfigured();

  const sourceStatus = (id: SourceId): string => {
    if (checking === id) return 'Checking…';
    if (!getSource(id)) {
      if (id === 'jamendo') return 'Add key in .env';
      return 'Unavailable';
    }
    const h = health[id];
    if (!h) return 'Connected';
    return h.ok ? 'Working' : `Broken (${h.stage ?? 'unknown'})`;
  };

  /** Run the source's self-test and show the step-by-step result. */
  const runCheck = async (id: SourceId) => {
    const source = getSource(id);
    if (!source?.checkHealth || checking) return;
    setChecking(id);
    const h = await source.checkHealth();
    setChecking(null);
    const when = new Date(h.checkedAt).toLocaleString();
    showSheet(
      h.ok ? `${SOURCE_LABELS[id]} is working` : `${SOURCE_LABELS[id]}: ${h.message}`,
      [h.details.join('\n'), h.fix, `Checked: ${when}`].filter(Boolean).join('\n\n'),
    );
  };

  const confirmClear = () =>
    showSheet(
      'Clear recently played?',
      'Your listening history on this device will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => useRecentStore.getState().clear() },
      ],
    );

  const manualCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    const found = await checkForUpdate();
    setCheckingUpdate(false);
    if (found) {
      setUpdateRelease(found);
    } else {
      showSheet('Up to date', `SONIQ v${version} is the latest version.`);
    }
  };

  const autoplay = useSettingsStore((s) => s.autoplay);
  const themeMode = useSettingsStore((s) => s.themeMode);

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={[type.heading, { color: colors.text }]}>
          Settings
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="APPEARANCE">
          <Row
            icon={scheme === 'dark' ? 'moon-outline' : 'sunny-outline'}
            label="Theme"
            value={THEME_LABEL[themeMode]}
            onPress={() =>
              showSheet('Theme', undefined, [
                ...(['system', 'light', 'dark'] as const).map((m) => ({
                  text: THEME_LABEL[m],
                  icon: (m === themeMode ? 'checkmark-circle' : m === 'system' ? 'phone-portrait-outline' : m === 'light' ? 'sunny-outline' : 'moon-outline') as 'checkmark-circle',
                  onPress: () => useSettingsStore.getState().setThemeMode(m),
                })),
                { text: 'Cancel', style: 'cancel' as const },
              ])
            }
            last
          />
        </Section>

        <Section title="PLAYBACK">
          <Row
            icon="infinite-outline"
            label="Autoplay similar songs"
            value={autoplay ? 'On' : 'Off'}
            onPress={() => useSettingsStore.getState().toggleAutoplay()}
          />
          <Row
            icon="sparkles-outline"
            label="Groq AI Recommendations"
            value={groqReady ? 'Connected' : 'Disconnected'}
            danger={!groqReady}
            last
          />
        </Section>

        <Section title="MUSIC SOURCES">
          {ALL_SOURCE_IDS.map((id, i) => (
            <Row
              key={id}
              icon={id === 'local' ? 'phone-portrait-outline' : 'radio-outline'}
              label={SOURCE_LABELS[id]}
              value={sourceStatus(id)}
              onPress={getSource(id)?.checkHealth ? () => void runCheck(id) : undefined}
              danger={health[id]?.ok === false}
              last={i === ALL_SOURCE_IDS.length - 1}
            />
          ))}
        </Section>

        <Section title="STORAGE">
          <Row
            icon="time-outline"
            label="Clear recently played"
            value={recentCount > 0 ? `${recentCount} songs` : 'Empty'}
            onPress={recentCount > 0 ? confirmClear : undefined}
            danger={recentCount > 0}
          />
          <Row
            icon="eye-off-outline"
            label="Show hidden songs again"
            value={hiddenCount > 0 ? `${hiddenCount} hidden` : 'None'}
            onPress={hiddenCount > 0 ? () => useUnavailableStore.getState().clear() : undefined}
            last
          />
        </Section>

        <Section title="ABOUT">
          <Row icon="musical-notes-outline" label="SONIQ" value={`v${version}`} />
          <Row
            icon="cloud-download-outline"
            label="Check for updates"
            value={checkingUpdate ? 'Checking…' : undefined}
            onPress={() => void manualCheckUpdate()}
          />
          <Row icon="heart-outline" label="Free & ad-free, licensed music only" last />
        </Section>
      </ScrollView>

      {updateRelease ? <UpdateSheet release={updateRelease} onClose={() => setUpdateRelease(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page - 10,
    gap: spacing.xs,
  },
  content: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.xl },
  sectionTitle: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  card: { borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  label: { flex: 1 },
});
