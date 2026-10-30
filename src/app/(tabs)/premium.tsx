import Ionicons from '@expo/vector-icons/Ionicons';
import * as Font from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
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
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { showSheet } from '@/components/Sheet';
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
import { hasPlus, PLUS_FREE_PREVIEW } from '@/lib/plus';
import { useSettingsStore } from '@/store/settingsStore';

const PERKS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'color-palette', text: '6 colour themes, incl. pure black' },
  { icon: 'text', text: 'Custom app fonts' },
  { icon: 'sparkles', text: 'More Plus perks on the way' },
];

function locked(item: { plus: boolean }): boolean {
  return item.plus && !hasPlus();
}

function askForPlus() {
  showSheet(
    'SONIQ Plus',
    'Plus is coming soon. You’ll be able to unlock every theme and font here.',
  );
}

/** Mini mock of the app in a theme: page, a card, a song row, the accent button. */
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
  const isLocked = locked(theme);
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
        {selected ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
        ) : isLocked ? (
          <Ionicons name="lock-closed" size={18} color={colors.textFaint} />
        ) : null}
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
  const isLocked = locked(font);
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
      <Text
        style={[
          styles.fontSample,
          { color: colors.text },
          family ? { fontFamily: family, fontWeight: 'normal' } : null,
        ]}
      >
        Aa
      </Text>
      <View style={styles.flex}>
        <Text
          style={[
            styles.fontName,
            { color: colors.text },
            family ? { fontFamily: family, fontWeight: 'normal' } : null,
          ]}
        >
          {font.name}
        </Text>
        <Text style={[type.caption, { color: colors.textMuted }]}>{font.vibe}</Text>
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
      ) : isLocked ? (
        <Ionicons name="lock-closed" size={18} color={colors.textFaint} />
      ) : null}
    </Pressable>
  );
}

export default function PremiumScreen() {
  const { colors } = useTheme();
  const appTheme = useSettingsStore((s) => s.appTheme);
  const appFont = useSettingsStore((s) => s.appFont);
  const [previewsReady, setPreviewsReady] = useState(false);

  // Load every Plus font once so each row can show its own "Aa" sample.
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

  const pickTheme = (t: AppTheme) => {
    if (locked(t)) return askForPlus();
    if (t.id === appTheme) return;
    tapHaptic();
    useSettingsStore.getState().setAppTheme(t.id);
  };

  const pickFont = (f: AppFont) => {
    if (locked(f)) return askForPlus();
    if (f.id === appFont) return;
    pressHaptic();
    // The whole app redraws with the new font; come back to this screen afterwards.
    returnHereAfterFontSwitch('/premium');
    useSettingsStore.getState().setAppFont(f.id);
  };

  return (
    <Screen>
      <ScreenHeader title="Plus" />
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient
          colors={[colors.accent, withAlpha(colors.accent, 0.55), colors.accentSoft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: withAlpha(colors.onAccent, 0.15) }]}>
              <Ionicons name="diamond" size={26} color={colors.onAccent} />
            </View>
            {PLUS_FREE_PREVIEW ? (
              <View style={[styles.previewPill, { backgroundColor: colors.onAccent }]}>
                <Text style={[styles.previewText, { color: colors.accent }]}>FREE PREVIEW</Text>
              </View>
            ) : null}
          </View>
          <Text style={[type.display, { color: colors.onAccent }]}>SONIQ Plus</Text>
          <Text style={[type.body, { color: colors.onAccent, opacity: 0.85 }]}>
            Make SONIQ look and feel like yours.
          </Text>
          <View style={styles.perks}>
            {PERKS.map((p) => (
              <View key={p.text} style={styles.perk}>
                <Ionicons name={p.icon} size={16} color={colors.onAccent} />
                <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>
                  {p.text}
                </Text>
              </View>
            ))}
          </View>
          {PLUS_FREE_PREVIEW ? (
            <Text style={[type.caption, { color: colors.onAccent, opacity: 0.8 }]}>
              Everything is unlocked while Plus is in preview.
            </Text>
          ) : null}
        </LinearGradient>

        <Text style={[styles.section, { color: colors.textMuted }]}>THEMES</Text>
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
          Light / dark stays in Settings. Pure Black shows in dark mode.
        </Text>

        <Text style={[styles.section, { color: colors.textMuted }]}>FONTS</Text>
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
  content: {
    paddingHorizontal: spacing.page,
    paddingBottom: CONTENT_BOTTOM_PADDING,
    gap: spacing.md,
  },
  hero: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  previewText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  perks: { gap: 6, marginVertical: spacing.sm },
  perk: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginTop: spacing.md },
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
