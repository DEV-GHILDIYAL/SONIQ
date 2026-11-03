import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/IconButton';
import { showSheet } from '@/components/Sheet';
import { radius, spacing, type, useTheme } from '@/components/theme';
import { parsePairToken } from '@/lib/devices';
import { confirmPairing } from '@/lib/pairConfirm';

/** Phone: scan the QR shown by SONIQ on a PC to link it to this account. */
export default function ScanScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  // One scan at a time (the camera reports the same code many times a second).
  const busy = useRef(false);

  const onScan = (data: string) => {
    if (busy.current) return;
    busy.current = true;
    const token = parsePairToken(data);
    if (!token) {
      showSheet('Not a SONIQ code', 'Scan the QR shown on the PC under “Link with your phone”.');
      setTimeout(() => (busy.current = false), 1500);
      return;
    }
    confirmPairing(token, () => router.back());
  };

  return (
    <View style={[styles.root, { backgroundColor: '#000' }]}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => onScan(data)}
        />
      ) : null}
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton icon="close" label="Close" color="#fff" onPress={() => router.back()} />
        <Text style={[type.heading, styles.white]}>Scan the QR on your PC</Text>
      </View>
      {permission?.granted ? (
        <View pointerEvents="none" style={styles.frameWrap}>
          <View style={[styles.frame, { borderColor: colors.accent }]} />
          <Text style={[type.caption, styles.hint]}>
            On the PC: “Use my account here too” shows the QR.
          </Text>
        </View>
      ) : (
        <View style={styles.ask}>
          <Ionicons name="camera-outline" size={48} color="#fff" />
          <Text style={[type.body, styles.white, styles.center]}>
            SONIQ needs the camera to scan the QR. Nothing is recorded or saved.
          </Text>
          <Pressable
            onPress={() => void requestPermission()}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: colors.accent }]}
          >
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Allow camera</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  white: { color: '#fff' },
  center: { textAlign: 'center' },
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  frame: { width: 240, height: 240, borderWidth: 3, borderRadius: radius.xl },
  hint: { color: 'rgba(255,255,255,0.8)', textAlign: 'center', paddingHorizontal: spacing.xl },
  ask: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  button: {
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
});
