import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text } from 'react-native';
import { useProfileStore } from '@/store/profileStore';
import { useTheme } from './theme';

/** Small round avatar (first letter of the name) in the top-left corner; opens Profile. */
export function ProfileAvatar({ size = 36 }: { size?: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const name = useProfileStore((s) => s.profile?.name ?? '');
  const photo = useProfileStore((s) => s.profile?.avatarUri ?? null);
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      hitSlop={8}
      style={({ pressed }) => [
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.initial, { color: colors.onAccent, fontSize: size * 0.45 }]}>
          {(name[0] ?? '?').toUpperCase()}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { fontWeight: '800' },
});
