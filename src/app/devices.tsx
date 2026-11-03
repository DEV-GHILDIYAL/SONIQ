import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme } from '@/components/theme';
import {
  formatLinkCode,
  listDevices,
  removeDevice,
  startLink,
  type LinkedDevice,
} from '@/lib/devices';
import { useProfileStore } from '@/store/profileStore';

const CODE_MS = 10 * 60 * 1000;

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Profile › Linked devices: make a link code, see and remove linked devices. */
export default function DevicesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const linked = useProfileStore((s) => !!s.profile?.linked);
  const [code, setCode] = useState<{ value: string; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [devices, setDevices] = useState<LinkedDevice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listDevices()
      .then((d) => {
        setDevices(d);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useFocusEffect(refresh);

  // Countdown for the code (and refresh the list, so a newly linked device shows up).
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => {
      setNow(Date.now());
      refresh();
    }, 5_000);
    return () => clearInterval(t);
  }, [code, refresh]);

  const makeCode = async () => {
    setBusy(true);
    try {
      const value = await startLink();
      setCode({ value, until: Date.now() + CODE_MS });
      setNow(Date.now());
    } catch (err) {
      showSheet("Couldn't make a code", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = (d: LinkedDevice) =>
    showSheet(
      d.this ? 'Sign out this device?' : `Remove ${d.name}?`,
      d.this
        ? 'This device stops syncing with your account until you link it again.'
        : 'It gets signed out of your account. You can link it again any time.',
      [
        {
          text: 'Remove',
          icon: 'trash-outline',
          style: 'destructive',
          onPress: () =>
            void removeDevice(d.key)
              .then(refresh)
              .catch((err: unknown) =>
                showSheet("Couldn't remove", err instanceof Error ? err.message : String(err)),
              ),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );

  const left = code ? Math.max(0, code.until - now) : 0;
  const expired = !!code && left === 0;

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={[type.heading, { color: colors.text }]}>
          Linked devices
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Ionicons name="laptop-outline" size={32} color={colors.accent} />
          <Text style={[type.title, { color: colors.text }]}>Use SONIQ on your PC</Text>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            Open SONIQ on the PC, choose “Use my account here too” and scan the QR it shows. Or show
            a code here and type it on the PC. Both stay signed in and in sync.
          </Text>
          {Platform.OS !== 'web' ? (
            <Pressable
              onPress={() => router.push('/scan')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.scan,
                { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="qr-code-outline" size={20} color={colors.onAccent} />
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Scan QR</Text>
            </Pressable>
          ) : null}
          {code && !expired ? (
            <>
              <Text selectable style={[styles.code, { color: colors.text }]}>
                {formatLinkCode(code.value)}
              </Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                Works once · {Math.floor(left / 60_000)}:
                {String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')} left
              </Text>
            </>
          ) : (
            <Pressable
              onPress={() => void makeCode()}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.surfaceHigh, opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {expired ? 'Make a new code' : 'Show a code instead'}
                </Text>
              )}
            </Pressable>
          )}
        </View>

        <Text style={[styles.section, { color: colors.textMuted }]}>LINKED DEVICES</Text>
        {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
        {devices === null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {devices && devices.length === 0 ? (
          <Text style={[type.caption, { color: colors.textMuted }]}>
            {linked ? 'This device is linked.' : 'No other devices yet.'}
          </Text>
        ) : null}
        {(devices ?? []).map((d) => (
          <View key={d.key} style={[styles.row, { backgroundColor: colors.surface }]}>
            <Ionicons
              name={/pc|windows|laptop/i.test(d.name) ? 'laptop-outline' : 'phone-portrait-outline'}
              size={24}
              color={colors.text}
            />
            <View style={styles.flex}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {d.name}
                {d.this ? ' (this device)' : ''}
              </Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                Active {ago(d.last_seen)}
              </Text>
            </View>
            <IconButton icon="close" label={`Remove ${d.name}`} onPress={() => remove(d)} />
          </View>
        ))}
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
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  code: { fontSize: 34, fontWeight: '800', letterSpacing: 6, marginTop: spacing.sm },
  button: {
    marginTop: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scan: { flexDirection: 'row', gap: spacing.sm },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
});
