import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Mix } from '@/store/recsStore';
import { UrlCover } from './CommunityPlaylistCard';
import { radius, spacing, type, useTheme } from './theme';

const GRADIENTS: Record<Mix['kind'], readonly [string, string]> = {
  repeat: ['#E0567A', '#6A3FA0'],
  daily: ['#2E86DE', '#1B2A6B'],
  fresh: ['#16A085', '#0B4F45'],
  because: ['#F39C12', '#A0461A'],
};
const DAILY = [
  ['#2E86DE', '#1B2A6B'],
  ['#8E44AD', '#3B1859'],
  ['#D35400', '#5E2108'],
] as const;

const ICON: Record<Mix['kind'], keyof typeof Ionicons.glyphMap> = {
  repeat: 'repeat',
  daily: 'sunny',
  fresh: 'sparkles',
  because: 'heart',
};

export function mixColors(mix: Mix): readonly [string, string] {
  if (mix.kind === 'daily') {
    const n = Number(mix.id.split('-')[1] ?? '1');
    return DAILY[(n - 1) % DAILY.length] ?? GRADIENTS.daily;
  }
  return GRADIENTS[mix.kind];
}

/** Square "Made for you" card: gradient with the mix name, its covers peeking in. */
export function MixCard({ mix, onPress }: { mix: Mix; onPress: () => void }) {
  const { colors } = useTheme();
  const covers = [
    ...new Set(mix.tracks.map((t) => t.artworkUrl).filter((u): u is string => !!u)),
  ].slice(0, 4);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${mix.title}. ${mix.subtitle}`}
      style={({ pressed }) => [styles.wrap, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <View style={styles.card}>
        <UrlCover seed={mix.id} urls={covers} size={148} />
        <LinearGradient
          colors={[mixColors(mix)[0] + 'F2', mixColors(mix)[1] + '99', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name={ICON[mix.kind]} size={16} color="#FFFFFF" style={styles.icon} />
        <Text style={styles.name} numberOfLines={2}>
          {mix.kind === 'because' ? 'Because you liked' : mix.title}
        </Text>
      </View>
      <Text style={[type.caption, styles.sub, { color: colors.textMuted }]} numberOfLines={2}>
        {mix.kind === 'because' ? mix.seedTitle : mix.subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 148 },
  card: {
    width: 148,
    height: 148,
    borderRadius: radius.md,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  icon: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  name: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    padding: spacing.sm,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sub: { marginTop: spacing.xs },
});
