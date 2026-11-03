import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { linkThisDevice, normalizeLinkCode, pollPairing, startPairing } from '@/lib/cloudBackup';
import { pairLink } from '@/lib/devices';
import { QrCode } from './QrCode';
import { radius, spacing, type, useTheme } from './theme';

/** Name shown in the other device's "Linked devices" list. */
export function thisDeviceName(): string {
  return Platform.OS === 'web'
    ? 'Windows PC'
    : Platform.OS === 'android'
      ? 'Android phone'
      : 'Device';
}

const POLL_MS = 2_000;

/** PC: a QR the signed-in phone scans (Profile → Link a device → Scan QR). */
function PairQr({ onDone }: { onDone: (name: string) => void }) {
  const { colors } = useTheme();
  const [pair, setPair] = useState<{ token: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Make a request (again after "New QR").
  useEffect(() => {
    let cancelled = false;
    startPairing(thisDeviceName())
      .then((p) => {
        if (cancelled) return;
        setError(null);
        setPair(p);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Wait for the phone.
  useEffect(() => {
    if (!pair) return;
    let stopped = false;
    const t = setInterval(() => {
      pollPairing(pair.token, pair.secret)
        .then((name) => {
          if (name && !stopped) {
            stopped = true;
            clearInterval(t);
            onDone(name);
          }
        })
        .catch((err: unknown) => {
          stopped = true;
          clearInterval(t);
          setPair(null);
          setError(err instanceof Error ? err.message : String(err));
        });
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [pair, onDone]);

  return (
    <View style={styles.qrBox}>
      {pair ? (
        <QrCode value={pairLink(pair.token)} size={200} />
      ) : error ? null : (
        <View style={[styles.qrPlaceholder, { backgroundColor: colors.surfaceHigh }]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
      {error ? (
        <View style={styles.qrError}>
          <Text style={[type.caption, { color: colors.danger, textAlign: 'center' }]}>{error}</Text>
          <Pressable
            onPress={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
            accessibilityRole="button"
            style={[styles.small, { backgroundColor: colors.surfaceHigh }]}
          >
            <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>New QR</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[type.caption, { color: colors.textMuted, textAlign: 'center' }]}>
          On your phone: Profile → Link a device →{' '}
          <Text style={{ fontWeight: '800' }}>Scan QR</Text>
          {'\n'}This page links by itself once you scan.
        </Text>
      )}
    </View>
  );
}

/** Link code from the signed-in device → this device joins the same account. */
export function LinkForm({
  onDone,
  onCancel,
}: {
  onDone: (name: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = normalizeLinkCode(code).length === 8;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await linkThisDevice(code, thisDeviceName()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={[type.title, { color: colors.text }]}>Link with your phone</Text>
      {Platform.OS === 'web' ? (
        <>
          <PairQr onDone={onDone} />
          <Text style={[type.micro, styles.or, { color: colors.textFaint }]}>OR TYPE A CODE</Text>
        </>
      ) : null}
      <Text style={[type.caption, { color: colors.textMuted }]}>
        On your phone open Profile → Link a device and type the 8-letter code here. Your phone stays
        signed in, and both stay in sync.
      </Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Link code  (XXXX XXXX)"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        onSubmitEditing={() => void submit()}
        accessibilityLabel="Link code"
        style={[
          styles.input,
          type.title,
          { backgroundColor: colors.surfaceHigh, color: colors.text },
        ]}
      />
      {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
      <Pressable
        onPress={() => void submit()}
        disabled={!ready || busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.accent, opacity: !ready || busy ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Link</Text>
        )}
      </Pressable>
      <Pressable onPress={onCancel} accessibilityRole="button" style={styles.link} hitSlop={8}>
        <Text style={[type.caption, { color: colors.textMuted, fontWeight: '700' }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  input: {
    height: 60,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    letterSpacing: 6,
    textAlign: 'center',
  },
  button: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  link: { alignSelf: 'center', paddingVertical: spacing.sm },
  qrBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  qrPlaceholder: {
    width: 224,
    height: 224,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrError: { alignItems: 'center', gap: spacing.sm },
  small: { paddingHorizontal: 16, height: 34, borderRadius: 17, justifyContent: 'center' },
  or: { textAlign: 'center', marginTop: spacing.xs },
});
