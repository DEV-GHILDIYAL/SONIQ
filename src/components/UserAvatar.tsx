import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { publicImageUrl } from '@/lib/avatar';
import { useTheme } from './theme';

/**
 * Another user's round photo (from the public avatars bucket), or the first letter of their
 * name when they have none / it can't load.
 */
export function UserAvatar({ id, name, size = 40 }: { id: string; name: string; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : publicImageUrl(id);
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.wrap, round, { backgroundColor: colors.accentSoft }]}>
      <Text style={[styles.initial, { color: colors.accent, fontSize: size * 0.42 }]}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
      {uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, round]}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { fontWeight: '800' },
});
