import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, spacing, type, useTheme } from './theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected = false, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected
            ? colors.accent
            : pressed
              ? colors.surfacePressed
              : colors.surfaceHigh,
        },
      ]}
    >
      <Text
        style={[type.caption, styles.label, { color: selected ? colors.onAccent : colors.text }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  label: { fontWeight: '600' },
});
