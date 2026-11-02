import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ClansView } from '@/components/ClansView';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/components/theme';
import { friendsAvailable, useFriendLists } from '@/lib/friends';

/** Friends shortcut with a badge for new requests. */
function FriendsButton() {
  const { colors } = useTheme();
  const router = useRouter();
  const { incoming } = useFriendLists();
  const count = incoming.length;
  return (
    <Pressable
      onPress={() => router.push('/friends')}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Friends, ${count} new requests` : 'Friends'}
      hitSlop={6}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name="people-outline" size={26} color={colors.text} />
      {count > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.badgeText, { color: colors.onAccent }]}>
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Clans tab: your crews, their chats and shared Jams. */
export default function ClansScreen() {
  return (
    <Screen>
      <ScreenHeader title="Clans" right={friendsAvailable() ? <FriendsButton /> : undefined} />
      <ClansView />
    </Screen>
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
});
