import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, spacing } from './theme';

type Props = {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Fixed-width card for horizontal rows; otherwise fills its grid cell. */
  compact?: boolean;
};

export function GenreTile({ label, color, icon, onPress, compact = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${label}`}
      style={({ pressed }) => [
        styles.tile,
        compact ? styles.compact : styles.full,
        { backgroundColor: color, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name={icon} size={20} color="rgba(255,255,255,0.85)" style={styles.icon} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.md,
    padding: spacing.md,
    justifyContent: 'flex-end',
  },
  full: { height: 92 },
  compact: { width: 120, height: 76 },
  icon: { position: 'absolute', top: spacing.md, right: spacing.md },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
