import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '@/components/MiniPlayer';
import { useClans } from '@/lib/clans';
import { useJamStore } from '@/store/jamStore';
import { spacing, TAB_BAR_HEIGHT, useTheme } from '@/components/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  const TabIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={24} color={color as string} />
  );
  return TabIcon;
}

/** The raised centre button for Crew (Jam + Clans). */
function CrewIcon({ focused }: { color: ColorValue; focused: boolean }) {
  const { colors } = useTheme();
  const live = useJamStore((s) => s.status !== 'idle');
  return (
    <View
      style={[
        styles.crew,
        {
          backgroundColor: focused ? colors.accent : colors.surfaceHigh,
          borderColor: colors.background,
          shadowColor: colors.accent,
        },
      ]}
    >
      <Ionicons
        name={focused ? 'headset' : 'headset-outline'}
        size={26}
        color={focused ? colors.onAccent : colors.text}
      />
      {live ? (
        <View
          style={[
            styles.liveDot,
            { backgroundColor: colors.danger, borderColor: colors.background },
          ]}
        />
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const barHeight = TAB_BAR_HEIGHT + insets.bottom;
  const unread = useClans().reduce((sum, c) => sum + c.unread, 0);

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: styles.label,
          tabBarStyle: {
            height: barHeight,
            paddingTop: 8,
            paddingBottom: insets.bottom,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            elevation: 0,
          },
        }}
      >
        <Tabs.Screen
          name="(home)"
          options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
        />
        <Tabs.Screen
          name="search"
          options={{ title: 'Search', tabBarIcon: tabIcon('search', 'search-outline') }}
        />
        <Tabs.Screen
          name="crew"
          options={{
            title: 'Crew',
            tabBarIcon: CrewIcon,
            tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
            tabBarBadgeStyle: {
              backgroundColor: colors.accent,
              color: colors.onAccent,
              fontSize: 10,
              top: -14,
            },
          }}
        />
        <Tabs.Screen
          name="premium"
          options={{ title: 'Plus', tabBarIcon: tabIcon('diamond', 'diamond-outline') }}
        />
        {/* Old routes kept for links (soniq://jam?code=…): they redirect into Crew. */}
        <Tabs.Screen name="jam" options={{ href: null }} />
        <Tabs.Screen name="clans" options={{ href: null }} />
        <Tabs.Screen
          name="library"
          options={{ title: 'Library', tabBarIcon: tabIcon('library', 'library-outline') }}
        />
      </Tabs>
      <View pointerEvents="box-none" style={[styles.mini, { bottom: barHeight + spacing.xs }]}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginBottom: 4 },
  mini: { position: 'absolute', left: 0, right: 0 },
  crew: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -22,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  liveDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});
