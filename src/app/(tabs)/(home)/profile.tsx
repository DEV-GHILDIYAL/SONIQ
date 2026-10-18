import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { showSheet } from '@/components/Sheet';
import { IconButton } from '@/components/IconButton';
import { RestoreForm } from '@/components/RestoreForm';
import { StreakCard } from '@/components/Streak';
import { Screen } from '@/components/Screen';
import { TextPrompt } from '@/components/TextPrompt';
import { CONTENT_BOTTOM_PADDING, radius, spacing, type, useTheme, withAlpha } from '@/components/theme';
import { deleteAvatar, pickAvatar } from '@/lib/avatar';
import { supabaseConfigured } from '@/lib/supabase';
import { useDownloadStore } from '@/store/downloadStore';
import { useLikedStore } from '@/store/likedStore';
import { usePlaylistStore } from '@/store/playlistStore';
import { useProfileStore } from '@/store/profileStore';

type IconName = keyof typeof Ionicons.glyphMap;

function LinkRow({ icon, label, value, onPress }: { icon: IconName; label: string; value?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.surface }]}
    >
      <View style={[styles.linkIcon, { backgroundColor: colors.surfaceHigh }]}>
        <Ionicons name={icon} size={20} color={colors.text} />
      </View>
      <Text style={[type.body, styles.flex, { color: colors.text, fontWeight: '600' }]}>{label}</Text>
      {value ? <Text style={[type.caption, { color: colors.textMuted }]}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const liked = useLikedStore((s) => s.tracks.length);
  const playlists = usePlaylistStore((s) => s.playlists.length);
  const downloads = useDownloadStore((s) => Object.keys(s.items).length);
  const [editing, setEditing] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const name = profile?.name ?? 'Listener';
  const photo = profile?.avatarUri ?? null;

  const choosePhoto = async () => {
    try {
      const uri = await pickAvatar(photo);
      if (uri) useProfileStore.getState().setAvatar(uri);
    } catch (err) {
      showSheet("Couldn't set the photo", err instanceof Error ? err.message : String(err));
    }
  };
  const onAvatarPress = () => {
    if (!photo) {
      void choosePhoto();
      return;
    }
    showSheet('Profile photo', undefined, [
      { text: 'Change photo', icon: 'image-outline', onPress: () => void choosePhoto() },
      {
        text: 'Remove photo',
        icon: 'trash-outline',
        style: 'destructive',
        onPress: () => {
          deleteAvatar(photo);
          useProfileStore.getState().setAvatar(null);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const since = profile
    ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;

  return (
    <Screen topColor={withAlpha(colors.accent, 0.35)}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, { backgroundColor: withAlpha(colors.accent, 0.35) }]}>
          <View style={styles.topBar}>
            <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
            <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
          </View>
          <View style={styles.identity}>
            <Pressable
              onPress={onAvatarPress}
              accessibilityRole="button"
              accessibilityLabel={photo ? 'Change or remove profile photo' : 'Add a profile photo'}
            >
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.initial, { color: colors.onAccent }]}>{(name[0] ?? '?').toUpperCase()}</Text>
                )}
              </View>
              <View style={[styles.camera, { backgroundColor: colors.surfaceHigh, borderColor: colors.background }]}>
                <Ionicons name="camera" size={16} color={colors.text} />
              </View>
            </Pressable>
            <View style={styles.flex}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
                {name}
              </Text>
              {since ? (
                <Text style={[type.caption, { color: colors.textMuted }]}>Listening since {since}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => setEditing(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.pill, { borderColor: colors.textMuted, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>Edit name</Text>
            </Pressable>
            {profile ? (
              <IconButton
                icon="share-social-outline"
                label="Share my SONIQ ID"
                onPress={() => void Share.share({ message: `Add me on SONIQ! My ID: ${profile.id}` })}
              />
            ) : null}
          </View>
        </View>

        <StreakCard />

        {profile ? (
          <View style={[styles.idCard, { backgroundColor: colors.surface }]}>
            <View style={styles.cardHead}>
              <Ionicons name="shield-checkmark" size={18} color={colors.accent} />
              <Text style={[type.micro, { color: colors.textMuted }]}>ACCOUNT BACKUP</Text>
            </View>
            <Text style={[type.caption, { color: colors.textMuted }]}>SONIQ ID</Text>
            <Text selectable style={[styles.id, { color: colors.text }]}>
              {profile.id}
            </Text>
            <Text style={[type.caption, styles.codeLabel, { color: colors.textMuted }]}>Backup code</Text>
            <Pressable
              onPress={() => setShowCode((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showCode ? 'Hide backup code' : 'Show backup code'}
              hitSlop={6}
              style={styles.codeRow}
            >
              <Text
                selectable={showCode}
                numberOfLines={1}
                style={[styles.id, styles.flex, { color: showCode ? colors.text : colors.textFaint }]}
              >
                {showCode ? profile.recoveryKey : '••••-••••-••••-••••'}
              </Text>
              <Ionicons name={showCode ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
            </Pressable>
            <Text style={[type.caption, styles.warn, { color: colors.textMuted }]}>
              Save both somewhere safe (screenshot / notes). If you reinstall SONIQ, they bring back your liked songs,
              playlists and history. Never share the backup code.
            </Text>
            <Pressable
              onPress={() =>
                void Share.share({
                  message: `SONIQ account backup (keep private)\nID: ${profile.id}\nBackup code: ${profile.recoveryKey}`,
                })
              }
              accessibilityRole="button"
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.surfaceHigh, opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="download-outline" size={18} color={colors.text} />
              <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>Save backup code</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.links}>
          <LinkRow icon="heart" label="Liked Songs" value={String(liked)} onPress={() => router.push('/liked')} />
          <LinkRow icon="albums-outline" label="Playlists" value={String(playlists)} onPress={() => router.push('/library')} />
          <LinkRow
            icon="arrow-down-circle-outline"
            label="Downloads"
            value={String(downloads)}
            onPress={() => router.push('/library')}
          />
          {supabaseConfigured() ? (
            <LinkRow icon="bulb-outline" label="Suggest a feature" onPress={() => router.push('/feedback')} />
          ) : null}
          <LinkRow icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
          {supabaseConfigured() ? (
            <LinkRow icon="refresh-outline" label="Restore from backup code" onPress={() => setRestoreOpen(true)} />
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={restoreOpen} animationType="slide" onRequestClose={() => setRestoreOpen(false)}>
        <View style={[styles.restoreSheet, { backgroundColor: colors.background }]}>
          <Text style={[type.caption, { color: colors.danger }]}>
            This replaces the account on this phone with the restored one.
          </Text>
          <RestoreForm
            onDone={(n) => {
              setRestoreOpen(false);
              showSheet('Welcome back', `Restored ${n}'s liked songs, playlists and history.`);
            }}
            onCancel={() => setRestoreOpen(false)}
          />
        </View>
      </Modal>

      <TextPrompt
        visible={editing}
        title="Your name"
        initialValue={name}
        confirmLabel="Save"
        onCancel={() => setEditing(false)}
        onConfirm={(n) => {
          if (profile) useProfileStore.getState().rename(n);
          else useProfileStore.getState().createProfile(n);
          setEditing(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: CONTENT_BOTTOM_PADDING },
  hero: { paddingBottom: spacing.lg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.page - 10,
    paddingTop: spacing.xs,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.page,
    marginTop: spacing.md,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 104, height: 104 },
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 44, fontWeight: '800' },
  name: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.page,
    marginTop: spacing.lg,
  },
  pill: {
    height: 34,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  idCard: {
    marginHorizontal: spacing.page,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  codeLabel: { marginTop: spacing.md },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warn: { marginTop: spacing.md, lineHeight: 18 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    height: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  restoreSheet: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.page, gap: spacing.md },
  id: { fontSize: 18, fontWeight: '700', letterSpacing: 1.5, marginTop: 4 },
  links: { marginTop: spacing.xl },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.page,
  },
  linkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
