import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  checkForUpdate,
  currentVersion,
  downloadUpdate,
  installUpdate,
  openApkInBrowser,
  parseNotes,
  type AppRelease,
  type UpdateDownload,
} from '@/lib/updates';
import { radius, spacing, type, useTheme } from './theme';

const LATER_KEY = 'soniq:update-later';
/** After "Later", ask again for the same version only after this long. */
const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 6;
const EMOJI_START = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;

type Phase =
  | { kind: 'idle' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'ready'; uri: string }
  | { kind: 'error'; message: string };

/** One "What's new" row: a leading emoji becomes the icon. */
function NoteRow({ text }: { text: string }) {
  const { colors } = useTheme();
  const m = EMOJI_START.exec(text);
  const emoji = m?.[1];
  const body = m ? text.slice(m[0].length) : text;
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
        {emoji ? (
          <Text style={styles.emoji}>{emoji}</Text>
        ) : (
          <Ionicons name="checkmark" size={16} color={colors.accent} />
        )}
      </View>
      <Text style={[type.body, styles.flex, { color: colors.text }]}>{body}</Text>
    </View>
  );
}

/** "What's new" card with in-app download (0-100%) and install. Used on launch and from Settings. */
export function UpdateSheet({ release, onClose }: { release: AppRelease; onClose: (later: boolean) => void }) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const job = useRef<UpdateDownload | null>(null);
  const notes = parseNotes(release.notes);
  const items = notes.items.length > 0 ? notes.items : ['🛠️ Bug fixes and speed improvements'];
  const extra = items.length - MAX_ITEMS;

  useEffect(() => () => job.current?.cancel(), []);

  const install = (uri: string) =>
    void installUpdate(uri).catch((err: unknown) =>
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
    );

  const start = () => {
    if (Platform.OS !== 'android') {
      openApkInBrowser(release);
      onClose(false);
      return;
    }
    setPhase({ kind: 'downloading', progress: 0 });
    const d = downloadUpdate(release, (progress) =>
      setPhase((p) => (p.kind === 'downloading' ? { kind: 'downloading', progress } : p)),
    );
    job.current = d;
    d.promise
      .then((uri) => {
        if (job.current !== d) return;
        job.current = null;
        setPhase({ kind: 'ready', uri });
        install(uri);
      })
      .catch((err: unknown) => {
        if (job.current !== d) return;
        job.current = null;
        setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  };

  const cancel = () => {
    const d = job.current;
    job.current = null;
    d?.cancel();
    setPhase({ kind: 'idle' });
  };

  const downloading = phase.kind === 'downloading';
  const pct = downloading ? Math.round(phase.progress * 100) : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => (downloading ? cancel() : onClose(true))}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="sparkles" size={14} color={colors.accent} />
            <Text style={[styles.badgeText, { color: colors.accent }]}>WHAT&apos;S NEW IN v{release.version}</Text>
          </View>
          <Text style={[type.title, { color: colors.text }]}>{notes.tagline ?? 'A fresh SONIQ is here'}</Text>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            You have v{currentVersion()}. Update in a few seconds, your library stays as it is.
          </Text>

          <ScrollView style={styles.notes} contentContainerStyle={styles.notesInner}>
            {items.slice(0, MAX_ITEMS).map((t, i) => (
              <NoteRow key={i} text={t} />
            ))}
            {extra > 0 ? (
              <Text style={[type.caption, { color: colors.textMuted }]}>+{extra} more improvements</Text>
            ) : null}
          </ScrollView>

          {downloading ? (
            <View style={styles.progressBox}>
              <View style={styles.progressTop}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>Downloading update…</Text>
                <Text style={[type.bodyStrong, { color: colors.accent }]}>{pct}%</Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.surfaceHigh }]}>
                <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
              </View>
            </View>
          ) : null}
          {phase.kind === 'error' ? (
            <Text style={[type.caption, { color: colors.danger }]}>
              Download failed ({phase.message}). Check your internet and try again.
            </Text>
          ) : null}

          <View style={styles.buttons}>
            {phase.kind === 'idle' ? (
              <>
                <Pressable onPress={() => onClose(true)} accessibilityRole="button" style={[styles.button, styles.later, { backgroundColor: colors.surfaceHigh }]}>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>Later</Text>
                </Pressable>
                <Pressable onPress={start} accessibilityRole="button" style={[styles.button, styles.primary, { backgroundColor: colors.accent }]}>
                  <Ionicons name="download-outline" size={18} color={colors.onAccent} />
                  <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Update now</Text>
                </Pressable>
              </>
            ) : null}
            {downloading ? (
              <Pressable onPress={cancel} accessibilityRole="button" style={[styles.button, styles.primary, { backgroundColor: colors.surfaceHigh }]}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[type.bodyStrong, { color: colors.text }]}>Cancel</Text>
              </Pressable>
            ) : null}
            {phase.kind === 'ready' ? (
              <>
                <Pressable onPress={() => onClose(false)} accessibilityRole="button" style={[styles.button, styles.later, { backgroundColor: colors.surfaceHigh }]}>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>Close</Text>
                </Pressable>
                <Pressable onPress={() => install(phase.uri)} accessibilityRole="button" style={[styles.button, styles.primary, { backgroundColor: colors.accent }]}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.onAccent} />
                  <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Install</Text>
                </Pressable>
              </>
            ) : null}
            {phase.kind === 'error' ? (
              <>
                <Pressable onPress={() => { openApkInBrowser(release); onClose(false); }} accessibilityRole="button" style={[styles.button, styles.later, { backgroundColor: colors.surfaceHigh }]}>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>Browser</Text>
                </Pressable>
                <Pressable onPress={start} accessibilityRole="button" style={[styles.button, styles.primary, { backgroundColor: colors.accent }]}>
                  <Ionicons name="refresh" size={18} color={colors.onAccent} />
                  <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Try again</Text>
                </Pressable>
              </>
            ) : null}
          </View>
          {phase.kind === 'ready' ? (
            <Text style={[type.caption, { color: colors.textMuted }]}>
              First time? Android may ask to allow installs from SONIQ. Allow it, then tap Install.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** Optional-update popup: shown on app start when a newer APK is published. */
export function UpdatePrompt() {
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

  return (
    <UpdateSheet
      release={release}
      onClose={(later) => {
        if (later) {
          void AsyncStorage.setItem(LATER_KEY, JSON.stringify({ version: release.version, at: Date.now() }));
        }
        setRelease(null);
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: spacing.page },
  card: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  notes: { maxHeight: 260 },
  notesInner: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 18 },
  progressBox: { gap: spacing.sm },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  button: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  later: { flex: 1 },
  primary: { flex: 2 },
});
