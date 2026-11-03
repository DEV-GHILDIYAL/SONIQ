import makeQr from 'qrcode-generator';
import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { radius } from './theme';

/** A QR code (dark modules on white, quiet zone included) as a plain image. */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const uri = useMemo(() => {
    const qr = makeQr(0, 'M');
    qr.addData(value);
    qr.make();
    return qr.createDataURL(8, 2);
  }, [value]);
  return (
    <View style={[styles.card, { width: size + 24, height: size + 24 }]}>
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        accessibilityLabel="QR code to link this device"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
