import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Genre } from '@/lib/genres';
import { radius, spacing } from './theme';

type Props = {
  genre: Genre;
  onPress: () => void;
  /** Fixed-width card for horizontal rows; otherwise fills its grid cell. */
  compact?: boolean;
};

/** Genre card: mood gradient, soft light circles, and a big tilted icon cut off at the corner. */
export function GenreTile({ genre, onPress, compact = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${genre.label}`}
      style={({ pressed }) => [
        styles.tile,
        compact ? styles.compact : styles.full,
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <LinearGradient
        colors={genre.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.glow, styles.glowBig]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowSmall]} />
      <Ionicons
        name={genre.icon}
        size={compact ? 54 : 72}
        color="rgba(255,255,255,0.28)"
        style={[styles.icon, compact && styles.iconCompact]}
      />
      <View style={styles.text}>
        <Text style={styles.label} numberOfLines={1}>
          {genre.label}
        </Text>
        {compact ? null : (
          <Text style={styles.tag} numberOfLines={1}>
            {genre.tag}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  full: { height: 104 },
  compact: { width: 120, height: 76 },
  glow: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' },
  glowBig: { width: 120, height: 120, top: -60, left: -30 },
  glowSmall: { width: 54, height: 54, bottom: -24, left: '45%' },
  icon: { position: 'absolute', right: -10, bottom: -8, transform: [{ rotate: '-18deg' }] },
  iconCompact: { right: -8, bottom: -10 },
  text: { gap: 2, maxWidth: '78%' },
  label: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tag: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
});
