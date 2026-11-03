import '@/lib/polyfills';
import * as Font from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { fontFiles, takeFontSwitchReturn } from '@/components/appearance';
import { StatusBar } from 'expo-status-bar';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { PlayerBar } from '@/components/desktop/PlayerBar';
import { Shortcuts } from '@/components/desktop/Shortcuts';
import { Sidebar } from '@/components/desktop/Sidebar';
import { useIsDesktop } from '@/components/desktop/useIsDesktop';
import { FestivalBurst } from '@/components/FestivalBurst';
import { FloatingMiniPlayer } from '@/components/FloatingMiniPlayer';
import { GlobalTabBar } from '@/components/GlobalTabBar';
import { NotificationCenter } from '@/components/NotificationCenter';
import { JamRejoinPrompt } from '@/components/JamRejoinPrompt';
import { Onboarding } from '@/components/Onboarding';
import { SheetHost } from '@/components/Sheet';
import { StreakToast } from '@/components/Streak';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { WhatsNewOnUpdate } from '@/components/WhatsNewOnUpdate';
import { OfflineBanner } from '@/components/OfflineBanner';
import { startNetworkWatch } from '@/lib/network';
import { TrackActionsSheet } from '@/components/TrackActionsSheet';
import { applyFont, useTheme } from '@/components/theme';
import { useSettingsStore } from '@/store/settingsStore';
import { radioTracks } from '@/lib/autoplay';
import { djNextSet, isDjActive, startDJWatcher } from '@/lib/dj';
import { startCloudBackup } from '@/lib/cloudBackup';
import { startClansSync } from '@/lib/clans';
import { startFriendsSync } from '@/lib/friends';
import { startListeningSync } from '@/lib/listeningSync';
import { startPublicPlaylistSync } from '@/lib/publicPlaylists';
import { startTasteTracking } from '@/lib/taste';
import { startNotifications } from '@/lib/notifications';
import { startUpdateCheck } from '@/lib/updateCheck';
import { setAutoplayProvider, setPrefetcher, setStreamResolver } from '@/player/engine';
import { resolveStream } from '@/lib/downloads';
import { prefetch } from '@/sources/registry';

// Downloaded songs play from the phone; everything else from its source.
setStreamResolver(resolveStream);
startNetworkWatch();
setPrefetcher(prefetch);
// While the AI DJ is on, its next set; otherwise personal radio.
setAutoplayProvider((seed, queue) => (isDjActive() ? djNextSet() : radioTracks(seed, queue)));
startDJWatcher();
startListeningSync();
startCloudBackup();
startPublicPlaylistSync();
startTasteTracking();
startNotifications();
startUpdateCheck();
// Not needed for the first screen: start a moment later so the app opens faster.
setTimeout(() => {
  startFriendsSync();
  startClansSync();
}, 2_000);

/**
 * Loads the chosen app font and returns the font that is actually applied.
 * The app re-mounts under that key, so every screen redraws with the new family.
 */
function useAppliedFont(): string {
  const router = useRouter();
  const wanted = useSettingsStore((s) => s.appFont);
  const scale = useSettingsStore((s) => s.textScale);
  const [applied, setApplied] = useState<string>('system:1');

  useEffect(() => {
    let cancelled = false;
    const files = fontFiles(wanted);
    const load = Object.keys(files).length > 0 ? Font.loadAsync(files) : Promise.resolve();
    load
      .then(() => {
        if (cancelled) return;
        applyFont(wanted, scale);
        setApplied(`${wanted}:${scale}`);
      })
      .catch(() => {
        // Font failed to load: keep the system font rather than break text.
        if (cancelled) return;
        applyFont('system', scale);
        setApplied(`system:${scale}`);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, scale]);

  // After a font switch the navigator re-mounts on Home: go back to where the user was.
  useEffect(() => {
    const target = takeFontSwitchReturn();
    if (!target) return;
    const t = setTimeout(() => router.navigate(target as Href), 0);
    return () => clearTimeout(t);
  }, [applied, router]);

  return applied;
}

export default function RootLayout() {
  const { scheme, colors } = useTheme();
  const font = useAppliedFont();
  const desktop = useIsDesktop();
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

  const stack = (
    <Stack
      key={font}
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="player"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="playlist/[id]" />
      <Stack.Screen name="liked" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="about" />
      <Stack.Screen name="appearance" />
      <Stack.Screen name="community/index" />
      <Stack.Screen name="community/[id]" />
      <Stack.Screen name="mix/[id]" />
      <Stack.Screen name="ai-playlist" />
      <Stack.Screen name="restore" options={{ animation: 'fade' }} />
      <Stack.Screen name="friend" options={{ animation: 'fade' }} />
      <Stack.Screen name="clan-join" options={{ animation: 'fade' }} />
      <Stack.Screen name="clan/[id]" />
      <Stack.Screen
        name="queue"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="album/[id]" />
      <Stack.Screen name="artist/[id]" />
      <Stack.Screen name="user/[id]" />
      <Stack.Screen name="devices" />
    </Stack>
  );

  return (
    <ThemeProvider value={navTheme}>
      {/* Windows app, wide window: sidebar + pages, player bar along the bottom. The same tree
          on phones (sidebar/bar render nothing), so resizing never re-mounts the pages. */}
      <View style={[styles.desktop, { backgroundColor: colors.background }]}>
        <View style={styles.desktopMain}>
          {desktop ? <Sidebar /> : null}
          <View style={styles.desktopPage}>{stack}</View>
        </View>
        {desktop ? <PlayerBar /> : null}
        {desktop ? <Shortcuts /> : null}
      </View>
      <GlobalTabBar />
      <FloatingMiniPlayer />
      <NotificationCenter />
      <TrackActionsSheet />
      <Onboarding />
      <UpdatePrompt />
      <WhatsNewOnUpdate />
      <OfflineBanner />
      <SheetHost />
      <JamRejoinPrompt />
      <StreakToast />
      <FestivalBurst />
      <AnimatedSplash />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  desktop: { flex: 1 },
  desktopMain: { flex: 1, flexDirection: 'row' },
  desktopPage: { flex: 1, overflow: 'hidden' },
});
