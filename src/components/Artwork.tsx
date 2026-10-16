import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colorFor, radius } from './theme';

type Props = {
  /** Used to pick a stable fallback color. */
  seed: string;
  uri?: string;
  size: number;
  rounded?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

/** Square cover art with a colored fallback when there is no image (or it fails to load). */
export function Artwork({
  seed,
  uri,
  size,
  rounded = false,
  icon = 'musical-notes',
  style,
}: Props) {
  const [failed, setFailed] = useState(false);
  const shape = {
    width: size,
    height: size,
    borderRadius: rounded ? size / 2 : size >= 120 ? radius.md : radius.sm,
  };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[shape, styles.image, style as object]}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      style={[shape, styles.fallback, { backgroundColor: colorFor(seed) }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={icon} size={Math.round(size * 0.42)} color="rgba(255,255,255,0.9)" />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#222' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
