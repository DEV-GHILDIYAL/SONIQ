import Ionicons from '@expo/vector-icons/Ionicons';
import * as Font from 'expo-font';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  APP_FONTS,
  APP_THEMES,
  fontFiles,
  returnHereAfterFontSwitch,
  type AppFont,
  type AppTheme,
} from '@/components/appearance';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import {
  CONTENT_BOTTOM_PADDING,
  palettes,
  radius,
  spacing,
  type,
  useTheme,
  withAlpha,
} from '@/components/theme';
import { pressHaptic, tapHaptic } from '@/lib/haptics';
import { useSettingsStore, type ThemeMode } from '@/store/settingsStore';

const MODES: { id: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'system', label: 'Auto', icon: 'phone-portrait-outline' },
  { id: 'light', label: 'Light', icon: 'sunny-outline' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline' },
];

/** Mini mock of the app in a theme: page, a song row, the accent play button. */
function ThemeCard({
  theme,
  selected,
  onPress,
}: {
  theme: AppTheme;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const p = { ...palettes[scheme], ...theme[scheme] };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${theme.name} theme`}
      style={({ pressed }) => [
        styles.themeCard,
        { borderColor: selected ? colors.accent : colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.mock, { backgroundColor: p.background }]}>
        <View style={[styles.mockRow, { backgroundColor: p.surface }]}>
          <View style={[styles.mockArt, { backgroundColor: p.accent }]} />
          <View style={styles.mockLines}>
            <View
              style={[styles.mockLine, { width: '80%', backgroundColor: p.text, opacity: 0.85 }]}
            />
            <View style={[styles.mockLine, { width: '50%', backgroundColor: p.textMuted }]} />
          </View>
        </View>
        <View style={[styles.mockPlay, { backgroundColor: p.accent }]}>
          <Ionicons name="play" size={12} color={p.onAccent} />
        </View>
      </View>
      <View style={styles.themeMeta}>
        <View style={styles.flex}>
          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {theme.name}
          </Text>
          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {theme.vibe}
          </Text>
        </View>
        {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : null}
      </View>
    </Pressable>
  );
}

function FontRow({
  font,
  selected,
  ready,
  onPress,
}: {
  font: AppFont;
  selected: boolean;
  ready: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const family = ready ? font.families.bold : undefined;
  const look = family ? { fontFamily: family, fontWeight: 'normal' as const } : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${font.name} font`}
      style={({ pressed }) => [
        styles.fontRow,
        {
          backgroundColor: selected ? withAlpha(colors.accent, 0.12) : colors.surface,
          borderColor: selected ? colors.accent : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.fontSample, { color: colors.text }, look]}>Aa</Text>
      <View style={styles.flex}>
        <Text style={[styles.fontName, { color: colors.text }, look]}>{font.name}</Text>
        <Text style={[type.caption, { color: colors.textMuted }]}>{font.vibe}</Text>
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : null}
    </Pressable>
  );
}

/** Settings > Colours & font: light/dark, colour theme and app font. */
export default function AppearanceScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const mode = useSettingsStore((s) => s.themeMode);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const appFont = useSettingsStore((s) => s.appFont);
  const [previewsReady, setPreviewsReady] = useState(false);

  // Load every font once so each row can show its own "Aa" sample.
  useEffect(() => {
    let cancelled = false;
    const all = Object.assign({}, ...APP_FONTS.map((f) => fontFiles(f.id))) as Record<
      string,
      number
    >;
    Font.loadAsync(all)
      .then(() => !cancelled && setPreviewsReady(true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const pickMode = (m: ThemeMode) => {
    if (m === mode) return;
    tapHaptic();
    useSettingsStore.getState().setThemeMode(m);
  };

  const pickTheme = (t: AppTheme) => {
    if (t.id === appTheme) return;
    tapHaptic();
    useSettingsStore.getState().setAppTheme(t.id);
  };

  const pickFont = (f: AppFont) => {
    if (f.id === appFont) return;
    pressHaptic();
    // The whole app redraws with the new font; come back to this screen afterwards.
    returnHereAfterFontSwitch('/appearance');
    useSettingsStore.getState().setAppFont(f.id);
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={[type.heading, { color: colors.text }]}>
          Colours & font
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.section, { color: colors.textMuted }]}>MODE</Text>
        <View
          style={[styles.modes, { backgroundColor: colors.surface }]}
          accessibilityRole="radiogroup"
        >
          {MODES.map((m) => {
            const on = m.id === mode;
            return (
              <Pressable
                key={m.id}
                onPress={() => pickMode(m.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.mode, on && { backgroundColor: colors.accent }]}
              >
                <Ionicons name={m.icon} size={16} color={on ? colors.onAccent : colors.textMuted} />
                <Text style={[type.bodyStrong, { color: on ? colors.onAccent : colors.textMuted }]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.section, { color: colors.textMuted }]}>COLOUR THEME</Text>
        <View style={styles.grid}>
          {APP_THEMES.map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              selected={t.id === appTheme}
              onPress={() => pickTheme(t)}
            />
          ))}
        </View>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          Pure Black shows in dark mode.
        </Text>

        <Text style={[styles.section, { color: colors.textMuted }]}>FONT</Text>
        <View style={styles.fonts}>
          {APP_FONTS.map((f) => (
            <FontRow
              key={f.id}
              font={f}
              selected={f.id === appFont}
              ready={previewsReady}
              onPress={() => pickFont(f)}
            />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page - 10,
    gap: spacing.xs,
  },
  content: {
    paddingHorizontal: spacing.page,
    paddingBottom: CONTENT_BOTTOM_PADDING,
    gap: spacing.md,
  },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginTop: spacing.md },
  modes: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, gap: 4 },
  mode: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  themeCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: 2,
    overflow: 'hidden',
  },
  mock: { height: 92, padding: 10, justifyContent: 'space-between' },
  mockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8 },
  mockArt: { width: 24, height: 24, borderRadius: 5 },
  mockLines: { flex: 1, gap: 4 },
  mockLine: { height: 5, borderRadius: 3 },
  mockPlay: {
    alignSelf: 'flex-end',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  fonts: { gap: spacing.sm },
  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  fontSample: { fontSize: 28, width: 52, textAlign: 'center', fontWeight: '700' },
  fontName: { fontSize: 16, fontWeight: '700' },
});
