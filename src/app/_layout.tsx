import '@/lib/polyfills';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TrackActionsSheet } from '@/components/TrackActionsSheet';
import { useTheme } from '@/components/theme';
import { setPrefetcher, setStreamResolver } from '@/player/engine';
import { getStreamUrl, prefetch } from '@/sources/registry';

setStreamResolver(getStreamUrl);
setPrefetcher(prefetch);

export default function RootLayout() {
  const { scheme, colors } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="player"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="playlist/[id]" />
        <Stack.Screen name="settings" />
        <Stack.Screen
          name="queue"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="album/[id]" />
        <Stack.Screen name="artist/[id]" />
      </Stack>
      <TrackActionsSheet />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
