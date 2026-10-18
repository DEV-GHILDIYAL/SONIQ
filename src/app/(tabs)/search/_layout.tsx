import { Stack } from 'expo-router';
import { useTheme } from '@/components/theme';

/** Search tab stack: browse page, then the full-screen search on top (tab bar stays). */
export default function SearchLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="find" options={{ animation: 'fade' }} />
    </Stack>
  );
}
