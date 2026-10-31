import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showSheet } from '@/components/Sheet';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { fontById, themeById } from '@/components/appearance';
import { radius, spacing, type, useTheme } from '@/components/theme';
import { isGroqConfigured, lastAiStatus } from '@/lib/groq';
import { UpdateSheet } from '@/components/UpdatePrompt';
import { checkForUpdate, type AppRelease } from '@/lib/updates';
import { ALL_SOURCE_IDS, getSource, SOURCE_LABELS } from '@/sources/registry';
import type { SourceId } from '@/sources/types';
import { useSourceHealthStore } from '@/store/sourceHealthStore';
import { askNotificationPermission, usualHour } from '@/lib/notifications';
import { useDjStore } from '@/store/djStore';
import { useNotifyStore, type NotifyKind } from '@/store/notifyStore';
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

const NOTIFY_ROWS: { kind: NotifyKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { kind: 'daily', label: 'Your mixes', icon: 'sparkles-outline' },
  { kind: 'recap', label: 'Weekly recap (Sunday)', icon: 'bar-chart-outline' },
  { kind: 'streak', label: 'Streak reminder', icon: 'flame-outline' },
  { kind: 'comeback', label: 'Miss you (after 3 days)', icon: 'heart-outline' },
  { kind: 'downloads', label: 'Downloads finished', icon: 'arrow-down-circle-outline' },
];

const HOURS = [9, 12, 15, 18, 20, 21];

function hourLabel(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
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
    if (!getSource(id)) return 'Unavailable';
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
    showSheet('Clear recently played?', 'Your listening history on this device will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => useRecentStore.getState().clear() },
    ]);

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

  const notify = useNotifyStore();

  const toggleNotifications = async () => {
    const store = useNotifyStore.getState();
    if (store.enabled) {
      store.setEnabled(false);
      return;
    }
    const ok = await askNotificationPermission();
    store.setAsked();
    if (ok) {
      store.setEnabled(true);
      return;
    }
    showSheet(
      'Notifications are blocked',
      'Allow notifications for SONIQ in your phone settings, then turn this on.',
      [
        {
          text: 'Open phone settings',
          icon: 'settings-outline',
          onPress: () => void Linking.openSettings(),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const pickHour = () =>
    showSheet(
      'Reminder time',
      `Auto uses when you usually listen (now ${hourLabel(usualHour())}).`,
      [
        {
          text: 'Auto',
          icon: 'sparkles-outline',
          onPress: () => useNotifyStore.getState().setHour(null),
        },
        ...HOURS.map((h) => ({
          text: hourLabel(h),
          onPress: () => useNotifyStore.getState().setHour(h),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );

  const autoplay = useSettingsStore((s) => s.autoplay);
  const haptics = useSettingsStore((s) => s.haptics);
  const djVoice = useDjStore((s) => s.voice);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const appFont = useSettingsStore((s) => s.appFont);

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
            label="Light / dark"
            value={THEME_LABEL[themeMode]}
            onPress={() =>
              showSheet('Theme', undefined, [
                ...(['system', 'light', 'dark'] as const).map((m) => ({
                  text: THEME_LABEL[m],
                  icon: (m === themeMode
                    ? 'checkmark-circle'
                    : m === 'system'
                      ? 'phone-portrait-outline'
                      : m === 'light'
                        ? 'sunny-outline'
                        : 'moon-outline') as 'checkmark-circle',
                  onPress: () => useSettingsStore.getState().setThemeMode(m),
                })),
                { text: 'Cancel', style: 'cancel' as const },
              ])
            }
          />
          <Row
            icon="color-palette-outline"
            label="Colours & font"
            value={`${themeById(appTheme).name} · ${fontById(appFont).name}`}
            onPress={() => router.push('/appearance')}
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
            icon="radio-outline"
            label="DJ talks between sets"
            value={djVoice ? 'On' : 'Off'}
            onPress={() => useDjStore.getState().toggleVoice()}
          />
          <Row
            icon="phone-portrait-outline"
            label="Haptic feedback"
            value={haptics ? 'On' : 'Off'}
            onPress={() => useSettingsStore.getState().toggleHaptics()}
          />
          <Row
            icon="sparkles-outline"
            label="AI (DJ, mixes, playlists)"
            value={!groqReady ? 'Off' : lastAiStatus() === 'limit' ? 'Daily limit reached' : 'On'}
            danger={!groqReady}
            last
          />
        </Section>

        <Section title="NOTIFICATIONS">
          <Row
            icon={notify.enabled ? 'notifications' : 'notifications-off-outline'}
            label="Notifications"
            value={notify.enabled ? 'On' : 'Off'}
            onPress={() => void toggleNotifications()}
            last={!notify.enabled}
          />
          {notify.enabled ? (
            <>
              {NOTIFY_ROWS.map((r) => (
                <Row
                  key={r.kind}
                  icon={r.icon}
                  label={r.label}
                  value={notify.kinds[r.kind] ? 'On' : 'Off'}
                  onPress={() => useNotifyStore.getState().toggleKind(r.kind)}
                />
              ))}
              <Row
                icon="time-outline"
                label="Reminder time"
                value={
                  notify.hour === null ? `Auto · ${hourLabel(usualHour())}` : hourLabel(notify.hour)
                }
                onPress={pickHour}
                last
              />
            </>
          ) : null}
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

      {updateRelease ? (
        <UpdateSheet release={updateRelease} onClose={() => setUpdateRelease(null)} />
      ) : null}
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
