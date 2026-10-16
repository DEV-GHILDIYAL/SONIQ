import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, type, useTheme } from './theme';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

/** Screen title row. Sits inside <Screen>, so it never handles the safe area itself. */
export function ScreenHeader({ title, subtitle, right }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        <Text accessibilityRole="header" style={[type.display, { color: colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, styles.subtitle, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    minHeight: 72,
  },
  titles: { flex: 1 },
  subtitle: { marginTop: 2 },
  // Pull trailing icon buttons flush with the page gutter (IconButton has its own 44px box).
  right: { flexDirection: 'row', alignItems: 'center', marginRight: -10 },
});
