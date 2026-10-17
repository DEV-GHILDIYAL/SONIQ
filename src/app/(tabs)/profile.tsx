import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextPrompt } from '@/components/TextPrompt';
import { CONTENT_BOTTOM_PADDING, spacing, type, useTheme } from '@/components/theme';
import { useProfileStore } from '@/store/profileStore';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const [editing, setEditing] = useState(false);

  const name = profile?.name ?? 'Listener';

  return (
    <Screen>
      <ScreenHeader
        title="Profile"
        right={<IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.initial, { color: colors.accent }]}>{(name[0] ?? '?').toUpperCase()}</Text>
          </View>
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit name"
            style={styles.nameRow}
          >
            <Text style={[type.title, { color: colors.text }]}>{name}</Text>
            <Text style={[type.caption, { color: colors.accent }]}>Edit</Text>
          </Pressable>
          {profile ? (
            <Pressable
              onPress={() => void Share.share({ message: `My SONIQ id: ${profile.id}` })}
              accessibilityRole="button"
              accessibilityLabel={`Your id ${profile.id}. Tap to share.`}
            >
              <Text selectable style={[type.caption, styles.id, { color: colors.textMuted }]}>
                ID · {profile.id}
              </Text>
            </Pressable>
          ) : null}
        </View>

      </ScrollView>

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
  content: { paddingHorizontal: spacing.page, gap: spacing.xl, paddingBottom: CONTENT_BOTTOM_PADDING },
  hero: { alignItems: 'center', gap: spacing.sm },
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 40, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  id: { letterSpacing: 1 },
});
