import { Stack } from 'expo-router';
import { useTheme } from '@/components/theme';

/** Home tab stack: Home, then Profile on top (tab bar stays visible). */
export default function HomeLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="friends" />
      <Stack.Screen name="karaoke" />
    </Stack>
  );
}
