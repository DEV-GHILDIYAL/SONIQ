import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '@/components/MiniPlayer';
import { spacing, TAB_BAR_HEIGHT, useTheme } from '@/components/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(active: IconName, inactive: IconName) {
  const TabIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={24} color={color as string} />
  );
  return TabIcon;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const barHeight = TAB_BAR_HEIGHT + insets.bottom;

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
          name="jam"
          options={{ title: 'Jam', tabBarIcon: tabIcon('people', 'people-outline') }}
        />
        <Tabs.Screen
          name="karaoke"
          options={{ title: 'Karaoke', tabBarIcon: tabIcon('mic', 'mic-outline') }}
        />
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
});
