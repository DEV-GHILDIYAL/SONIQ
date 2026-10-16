import { Pressable, StyleSheet, Text } from 'react-native';
import { Artwork } from './Artwork';
import { spacing, type, useTheme } from './theme';

type Props = {
  seed: string;
  title: string;
  subtitle?: string;
  uri?: string;
  size?: number;
  onPress: () => void;
  accessibilityLabel?: string;
};

/** Square artwork card with two lines of text, for horizontal carousels. */
export function MediaCard({
  seed,
  title,
  subtitle,
  uri,
  size = 132,
  onPress,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.card, { width: size, opacity: pressed ? 0.75 : 1 }]}
    >
      <Artwork seed={seed} uri={uri} size={size} />
      <Text numberOfLines={1} style={[type.caption, styles.title, { color: colors.text }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={1}
          style={[type.caption, styles.subtitle, { color: colors.textMuted }]}
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {},
  title: { fontWeight: '700', marginTop: spacing.sm },
  subtitle: { marginTop: 2 },
});
