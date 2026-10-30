import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Track } from '@/sources/types';
import { Artwork } from './Artwork';
import { radius } from './theme';

/** Distinct cover images of the first songs, in playlist order. */
export function coverImages(tracks: readonly Track[], max = 4): string[] {
  const out: string[] = [];
  for (const t of tracks) {
    if (t.artworkUrl && !out.includes(t.artworkUrl)) out.push(t.artworkUrl);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Playlist cover: 4+ different song covers → 2×2 collage, otherwise the first song's cover,
 * or the colored placeholder for an empty playlist.
 */
export function PlaylistCover({
  seed,
  tracks,
  size,
  style,
}: {
  seed: string;
  tracks: readonly Track[];
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const images = coverImages(tracks);
  if (images.length < 4) {
    return <Artwork seed={seed} uri={images[0]} size={size} icon="musical-note" style={style} />;
  }
  const half = size / 2;
  return (
    <View
      style={[
        styles.grid,
        { width: size, height: size, borderRadius: size >= 120 ? radius.md : radius.sm },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {images.map((uri) => (
        <Image
          key={uri}
          source={{ uri }}
          style={{ width: half, height: half }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
});
