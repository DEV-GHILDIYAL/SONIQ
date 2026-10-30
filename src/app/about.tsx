import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme, withAlpha } from '@/components/theme';
import { NoteRow, UpdateSheet } from '@/components/UpdatePrompt';
import { supabaseConfigured } from '@/lib/supabase';
import { checkForUpdate, currentVersion, parseNotes, type AppRelease } from '@/lib/updates';
import { markWhatsNewSeen, RELEASES } from '@/lib/whatsnew';

type IconName = keyof typeof Ionicons.glyphMap;

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'people-outline', title: 'Jam', text: 'Listen together in real time, on any phone.' },
  { icon: 'shield-outline', title: 'Clans', text: 'Your crew: chat and drop Jams in one tap.' },
  { icon: 'sparkles-outline', title: 'AI picks', text: 'Smart autoplay that learns your taste.' },
  { icon: 'cloud-offline-outline', title: 'Offline', text: 'Save songs and play them without internet.' },
];

const SOURCES = ['Jamendo', 'Internet Archive', 'Free Music Archive', 'Your phone'];

function Row({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.surface }]}
    >
      <View style={[styles.linkIcon, { backgroundColor: colors.surfaceHigh }]}>
        <Ionicons name={icon} size={20} color={colors.text} />
      </View>
      <Text style={[type.body, styles.flex, { color: colors.text, fontWeight: '600' }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

function ReleaseCard({ version, notes, open, onToggle }: { version: string; notes: string; open: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const parsed = parseNotes(notes);
  const current = version === currentVersion();
  return (
    <View style={[styles.release, { backgroundColor: colors.surface }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.releaseHead}>
        <View style={styles.flex}>
          <View style={styles.releaseTitle}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>v{version}</Text>
            {current ? (
              <View style={[styles.pill, { backgroundColor: colors.accent }]}>
                <Text style={[styles.pillText, { color: colors.onAccent }]}>YOU HAVE THIS</Text>
              </View>
            ) : null}
          </View>
          {parsed.tagline ? (
            <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={open ? undefined : 1}>
              {parsed.tagline}
            </Text>
          ) : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.releaseItems}>
          {(parsed.items.length ? parsed.items : ['🛠️ Bug fixes and speed improvements']).map((t, i) => (
            <NoteRow key={i} text={t} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function AboutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const version = currentVersion();
  const build = Constants.expoConfig?.android?.versionCode;
  const [open, setOpen] = useState<string | null>(RELEASES[0]?.version ?? null);
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<AppRelease | null>(null);

  useEffect(() => {
    void markWhatsNewSeen();
  }, []);

  const checkUpdates = async () => {
    if (checking) return;
    setChecking(true);
    const found = await checkForUpdate();
    setChecking(false);
    if (found) setUpdate(found);
    else showSheet("You're up to date", `SONIQ v${version} is the latest version.`);
  };

  const credits = () =>
    showSheet(
      'Credits',
      'Music comes from Jamendo, Internet Archive and Free Music Archive under each track\'s own license ' +
        '(mostly Creative Commons). Songs, artwork and names belong to their artists.\n\n' +
        'Built with Expo, React Native and Supabase. AI picks run on Groq.',
    );

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={[type.heading, { color: colors.text }]}>
          About SONIQ
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.glow, { backgroundColor: withAlpha(colors.accent, 0.14) }]} />
          <Image source={require('../../assets/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
          <Text style={[type.title, { color: colors.text }]}>SONIQ</Text>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            v{version}
            {build ? ` · build ${build}` : ''}
          </Text>
          <Text style={[type.body, styles.center, { color: colors.textMuted }]}>
            Free, ad-free music for you and your friends. Licensed sources only.
          </Text>
        </View>

        <Text style={[styles.section, { color: colors.textMuted }]}>WHAT&apos;S NEW</Text>
        {RELEASES.length ? (
          RELEASES.map((r) => (
            <ReleaseCard
              key={r.version}
              version={r.version}
              notes={r.notes}
              open={open === r.version}
              onToggle={() => setOpen((o) => (o === r.version ? null : r.version))}
            />
          ))
        ) : (
          <Text style={[type.caption, { color: colors.textMuted }]}>No release notes yet.</Text>
        )}

        <Text style={[styles.section, { color: colors.textMuted }]}>ABOUT THE APP</Text>
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={[styles.feature, { backgroundColor: colors.surface }]}>
              <Ionicons name={f.icon} size={22} color={colors.accent} />
              <Text style={[type.bodyStrong, { color: colors.text }]}>{f.title}</Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>{f.text}</Text>
            </View>
          ))}
        </View>
        <View style={styles.chips}>
          {SOURCES.map((s) => (
            <View key={s} style={[styles.chip, { backgroundColor: colors.surfaceHigh }]}>
              <Text style={[type.caption, { color: colors.text, fontWeight: '600' }]}>{s}</Text>
            </View>
          ))}
        </View>

        <View style={styles.links}>
          <Row icon="cloud-download-outline" label={checking ? 'Checking for updates…' : 'Check for updates'} onPress={() => void checkUpdates()} />
          {supabaseConfigured() ? (
            <Row icon="bulb-outline" label="Send feedback" onPress={() => router.push('/feedback')} />
          ) : null}
          <Row icon="ribbon-outline" label="Licenses & credits" onPress={credits} />
        </View>
      </ScrollView>

      {update ? <UpdateSheet release={update} onClose={() => setUpdate(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.page - 10, gap: spacing.xs },
  content: { paddingHorizontal: spacing.page, paddingBottom: CONTENT_BOTTOM_PADDING, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  glow: { position: 'absolute', top: 0, width: 200, height: 200, borderRadius: 100 },
  logo: { width: 88, height: 88, borderRadius: 24, marginBottom: spacing.sm },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginTop: spacing.md },
  release: { borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  releaseHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  releaseTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  releaseItems: { gap: spacing.sm },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  feature: { width: '48%', flexGrow: 1, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  links: { marginTop: spacing.sm, marginHorizontal: -spacing.page },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.page },
  linkIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
