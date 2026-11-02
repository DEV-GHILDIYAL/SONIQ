import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { UserAvatar } from '@/components/UserAvatar';
import {
  CONTENT_BOTTOM_PADDING,
  radius,
  spacing,
  type,
  useTheme,
  withAlpha,
} from '@/components/theme';
import { BANNER_RATIO, publicImageUrl } from '@/lib/avatar';
import {
  removeFriend,
  respondToRequest,
  sendFriendRequest,
  setBlocked,
  viewProfile,
  type PublicProfile,
} from '@/lib/friends';

type IconName = keyof typeof Ionicons.glyphMap;

/** Another listener's profile (opened from clan chat, clan members or friends). */
export default function UserProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId ?? '').toUpperCase();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);

  const fetchProfile = useCallback(
    () =>
      viewProfile(id)
        .then((p) => {
          setError(null);
          setProfile(p);
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err))),
    [id],
  );

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const load = () => {
    setError(null);
    void fetchProfile();
  };

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setProfile(await viewProfile(id));
    } catch (err) {
      showSheet("Couldn't do that", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const friendMenu = () => {
    if (!profile) return;
    showSheet(profile.name, undefined, [
      {
        text: 'Remove friend',
        icon: 'person-remove-outline',
        style: 'destructive',
        onPress: () => void act(() => removeFriend(id)),
      },
      {
        text: 'Block',
        icon: 'ban-outline',
        style: 'destructive',
        onPress: () => void act(() => setBlocked(id, true)),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const banner = bannerFailed ? null : publicImageUrl(id, 'banner');
  const since = profile
    ? new Date(profile.since).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : '';

  /** The one button that fits how you two are connected. */
  const action = (() => {
    if (!profile) return null;
    const btn = (
      label: string,
      icon: IconName,
      onPress: () => void,
      primary = true,
    ): { label: string; icon: IconName; onPress: () => void; primary: boolean } => ({
      label,
      icon,
      onPress,
      primary,
    });
    switch (profile.status) {
      case 'me':
        return btn('Edit your profile', 'create-outline', () => router.push('/profile'), false);
      case 'none':
        return btn('Add friend', 'person-add', () => void act(() => sendFriendRequest(id)));
      case 'outgoing':
        return btn(
          'Request sent · Cancel',
          'time-outline',
          () => void act(() => removeFriend(id)),
          false,
        );
      case 'incoming':
        return btn('Accept request', 'checkmark', () => void act(() => respondToRequest(id, true)));
      case 'friends':
        return btn('Friends', 'checkmark-circle', friendMenu, false);
      case 'blocked':
        return btn(
          'Unblock',
          'lock-open-outline',
          () => void act(() => setBlocked(id, false)),
          false,
        );
    }
  })();

  return (
    <Screen topColor={banner ? '#000' : withAlpha(colors.accent, 0.55)}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.banner}>
          {banner ? (
            <Image
              source={{ uri: banner }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setBannerFailed(true)}
            />
          ) : (
            <LinearGradient
              colors={[withAlpha(colors.accent, 0.55), withAlpha(colors.accent, 0.12)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
            style={styles.bannerShade}
            pointerEvents="none"
          />
          <View style={styles.topBar}>
            <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
          </View>
        </View>

        <View style={styles.identity}>
          <View style={[styles.avatarRing, { borderColor: colors.background }]}>
            <UserAvatar id={id} name={profile?.name ?? '?'} size={100} />
          </View>
        </View>

        {error ? (
          <ErrorState error={error} onRetry={load} />
        ) : !profile ? (
          <ActivityIndicator style={styles.loading} color={colors.accent} />
        ) : (
          <View style={styles.body}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
              {profile.name}
            </Text>
            <Text style={[type.caption, { color: colors.textMuted }]}>Listening since {since}</Text>
            <Text selectable style={[type.caption, styles.id, { color: colors.textFaint }]}>
              {profile.id}
            </Text>

            {action ? (
              <Pressable
                onPress={action.onPress}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.action,
                  {
                    backgroundColor: action.primary ? colors.accent : colors.surfaceHigh,
                    opacity: busy ? 0.6 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                {busy ? (
                  <ActivityIndicator
                    size="small"
                    color={action.primary ? colors.onAccent : colors.text}
                  />
                ) : (
                  <Ionicons
                    name={action.icon}
                    size={18}
                    color={action.primary ? colors.onAccent : colors.text}
                  />
                )}
                <Text
                  style={[
                    type.bodyStrong,
                    { color: action.primary ? colors.onAccent : colors.text },
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ) : null}

            {profile.status === 'incoming' ? (
              <Pressable
                onPress={() => void act(() => respondToRequest(id, false))}
                disabled={busy}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={[type.caption, styles.decline, { color: colors.textMuted }]}>
                  Decline
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: CONTENT_BOTTOM_PADDING },
  banner: { width: '100%', aspectRatio: BANNER_RATIO, overflow: 'hidden' },
  bannerShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 64 },
  topBar: { paddingHorizontal: spacing.page - 10, paddingTop: spacing.xs },
  identity: { paddingHorizontal: spacing.page, marginTop: -52 },
  avatarRing: { alignSelf: 'flex-start', borderWidth: 4, borderRadius: 54 },
  loading: { marginTop: spacing.xl },
  body: { paddingHorizontal: spacing.page, marginTop: spacing.md, gap: 2 },
  name: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  id: { letterSpacing: 1, marginTop: 2 },
  action: {
    marginTop: spacing.xl,
    height: 48,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  decline: { textAlign: 'center', marginTop: spacing.md, fontWeight: '700' },
});
