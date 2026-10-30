import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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

/**
 * Square cover art. expo-image keeps covers on disk, so lists and the player show them
 * instantly after the first load (also offline). Colored fallback when there is no image.
 */
function ArtworkBase({ seed, uri, size, rounded = false, icon = 'musical-notes', style }: Props) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const shape = {
    width: size,
    height: size,
    borderRadius: rounded ? size / 2 : size >= 120 ? radius.md : radius.sm,
  };

  if (uri && failedUri !== uri) {
    return (
      <Image
        source={{ uri }}
        style={[shape, { backgroundColor: colorFor(seed) }, style as object]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        // Rows are recycled in lists: don't flash the previous row's cover.
        recyclingKey={uri}
        onError={() => setFailedUri(uri)}
        accessible={false}
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
  fallback: { alignItems: 'center', justifyContent: 'center' },
});

/** Memoized: rows re-render often, the cover rarely changes. */
export const Artwork = memo(ArtworkBase);
