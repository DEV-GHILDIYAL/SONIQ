import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Artwork } from '@/components/Artwork';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { showSheet } from '@/components/Sheet';
import { TextPrompt } from '@/components/TextPrompt';
import {
  PAGE_BOTTOM_PADDING,
  radius,
  spacing,
  type,
  useTheme,
  withAlpha,
} from '@/components/theme';
import {
  AI_PLAYLIST_SIZE,
  AI_PRESETS,
  generatePlaylist,
  replacementFor,
  saveDraft,
  type AiDraft,
  type DraftSong,
} from '@/lib/aiPlaylist';
import { friendlyError } from '@/lib/errors';
import { pressHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { playQueue } from '@/player/engine';

const TWEAKS = [
  'More upbeat',
  'More chill',
  'More new songs',
  'More old classics',
  'More Punjabi',
  'More English',
];

type Phase =
  | { kind: 'input' }
  | { kind: 'working'; done: number; total: number; tweaking: boolean }
  | { kind: 'draft'; draft: AiDraft };

function errorText(err: unknown): string {
  return err instanceof Error && err.message && !/^[A-Z]\w+Error/.test(err.message)
    ? err.message
    : friendlyError(err).message;
}

/** Describe a vibe → AI builds a named playlist; preview, tweak, then save. */
export default function AiPlaylistScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const [prompt, setPrompt] = useState(params.prompt ?? '');
  const [personal, setPersonal] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const [tweak, setTweak] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const draft = phase.kind === 'draft' ? phase.draft : null;

  const run = (text: string, previous?: DraftSong[], change?: string) => {
    const q = text.trim();
    if (q.length < 3) return;
    pressHaptic();
    setPhase({ kind: 'working', done: 0, total: AI_PLAYLIST_SIZE, tweaking: !!change });
    generatePlaylist(q, { personal, previous, tweak: change }, (done, total) =>
      setPhase((p) => (p.kind === 'working' ? { ...p, done, total } : p)),
    )
      .then((d) => {
        successHaptic();
        setTweak('');
        setPhase({ kind: 'draft', draft: d });
      })
      .catch((err: unknown) => {
        setPhase(previous && draft ? { kind: 'draft', draft } : { kind: 'input' });
        showSheet('Couldn’t make the playlist', errorText(err));
      });
  };

  const update = (fn: (d: AiDraft) => AiDraft) =>
    setPhase((p) => (p.kind === 'draft' ? { kind: 'draft', draft: fn(p.draft) } : p));

  const remove = (id: string) => {
    tapHaptic();
    update((d) => ({ ...d, songs: d.songs.filter((s) => s.track.id !== id) }));
  };

  const swap = (id: string) => {
    if (!draft || busyId) return;
    tapHaptic();
    setBusyId(id);
    replacementFor(draft, personal)
      .then((song) => {
        if (!song) return showSheet('No new song found', 'Try again, or tweak the whole playlist.');
        update((d) => ({ ...d, songs: d.songs.map((s) => (s.track.id === id ? song : s)) }));
      })
      .catch((err: unknown) => showSheet('Couldn’t swap', errorText(err)))
      .finally(() => setBusyId(null));
  };

  const save = (name: string) => {
    if (!draft) return;
    setNaming(false);
    const p = saveDraft(draft, name);
    successHaptic();
    router.replace(`/playlist/${p.id}`);
  };

  const topBar = (
    <View style={styles.topBar}>
      <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
      <Text accessibilityRole="header" style={[type.heading, styles.flex, { color: colors.text }]}>
        Create with AI
      </Text>
      {draft ? (
        <IconButton icon="refresh" label="Start over" onPress={() => setPhase({ kind: 'input' })} />
      ) : null}
    </View>
  );

  if (phase.kind === 'working') {
    const pct = phase.total ? Math.round((phase.done / phase.total) * 100) : 0;
    return (
      <Screen>
        {topBar}
        <View style={styles.working}>
          <View style={[styles.orb, { backgroundColor: withAlpha(colors.accent, 0.15) }]}>
            <Ionicons name="sparkles" size={42} color={colors.accent} />
          </View>
          <Text style={[type.title, styles.center, { color: colors.text }]}>
            {phase.tweaking
              ? 'Reworking your playlist…'
              : phase.done === 0
                ? 'Thinking about your vibe…'
                : 'Finding the songs…'}
          </Text>
          <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
            {phase.done === 0 ? 'AI is picking songs' : `Found ${phase.done} of ${phase.total}`}
          </Text>
          <View style={[styles.track, { backgroundColor: colors.surfaceHigh }]}>
            <View
              style={[
                styles.fill,
                { width: `${Math.max(pct, 4)}%`, backgroundColor: colors.accent },
              ]}
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (!draft) {
    return (
      <Screen>
        {topBar}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.inputContent}
            keyboardShouldPersistTaps="handled"
          >
            <LinearGradient
              colors={[withAlpha(colors.accent, 0.35), withAlpha(colors.accent, 0.05)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Ionicons name="sparkles" size={26} color={colors.accent} />
              <Text style={[type.title, { color: colors.text }]}>Describe a vibe</Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>
                A mood, a moment, a mix of artists. AI picks {AI_PLAYLIST_SIZE} songs and names it.
              </Text>
            </LinearGradient>

            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder="e.g. Barish mein long drive, 90s Bollywood, thoda sad"
              placeholderTextColor={colors.placeholder}
              multiline
              maxLength={300}
              style={[
                type.body,
                styles.input,
                { backgroundColor: colors.surface, color: colors.text },
              ]}
            />

            <View style={styles.chips}>
              {AI_PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => {
                    tapHaptic();
                    setPrompt(p.prompt);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: colors.surfaceHigh, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.toggle, { backgroundColor: colors.surface }]}>
              <View style={styles.flex}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>Use my taste</Text>
                <Text style={[type.caption, { color: colors.textMuted }]}>
                  Lean towards artists and languages you play
                </Text>
              </View>
              <Switch
                value={personal}
                onValueChange={setPersonal}
                trackColor={{ true: colors.accent, false: colors.surfaceHigh }}
                thumbColor="#FFFFFF"
              />
            </View>

            <Pressable
              onPress={() => run(prompt)}
              disabled={prompt.trim().length < 3}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.generate,
                {
                  backgroundColor: colors.accent,
                  opacity: prompt.trim().length < 3 ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons name="sparkles" size={18} color={colors.onAccent} />
              <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Create playlist</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  const header = (
    <View style={styles.draftHead}>
      <Pressable
        onPress={() => setNaming(true)}
        accessibilityRole="button"
        accessibilityLabel="Rename"
        style={styles.nameRow}
      >
        <Text style={[type.display, styles.flexShrink, { color: colors.text }]} numberOfLines={2}>
          {draft.name}
        </Text>
        <Ionicons name="pencil" size={16} color={colors.textMuted} />
      </Pressable>
      {draft.description ? (
        <Text style={[type.body, { color: colors.textMuted }]}>{draft.description}</Text>
      ) : null}
      <Text style={[type.caption, { color: colors.textMuted }]}>
        {draft.songs.length} songs · “{draft.prompt}”
      </Text>

      <View style={styles.draftActions}>
        <Pressable
          onPress={() => setNaming(true)}
          disabled={draft.songs.length === 0}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.save,
            { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="add-circle" size={18} color={colors.onAccent} />
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>Save to library</Text>
        </Pressable>
        <IconButton
          icon="play"
          label="Play"
          size={24}
          color={colors.onAccent}
          style={[styles.play, { backgroundColor: colors.text }]}
          onPress={() =>
            void playQueue(
              draft.songs.map((s) => s.track),
              0,
            )
          }
        />
      </View>

      <View style={[styles.tweakBox, { backgroundColor: colors.surface }]}>
        <TextInput
          value={tweak}
          onChangeText={setTweak}
          placeholder="Tweak it: make it more upbeat…"
          placeholderTextColor={colors.placeholder}
          maxLength={200}
          returnKeyType="send"
          onSubmitEditing={() => tweak.trim() && run(draft.prompt, draft.songs, tweak)}
          style={[type.body, styles.flex, { color: colors.text }]}
        />
        <IconButton
          icon="arrow-up-circle"
          label="Apply tweak"
          size={28}
          color={tweak.trim() ? colors.accent : colors.textFaint}
          disabled={!tweak.trim()}
          onPress={() => run(draft.prompt, draft.songs, tweak)}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tweakChips}
      >
        {TWEAKS.map((t) => (
          <Pressable
            key={t}
            onPress={() => run(draft.prompt, draft.songs, t)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: colors.surfaceHigh, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Screen>
      {topBar}
      <FlatList
        data={draft.songs}
        keyExtractor={(s) => s.track.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: PAGE_BOTTOM_PADDING }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              void playQueue(
                draft.songs.map((s) => s.track),
                index,
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`${item.track.title} by ${item.track.artist}`}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
          >
            <Artwork seed={item.track.id} uri={item.track.artworkUrl} size={48} />
            <View style={styles.flex}>
              <Text
                style={[type.body, { color: colors.text, fontWeight: '600' }]}
                numberOfLines={1}
              >
                {item.track.title}
              </Text>
              <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                {item.track.artist}
              </Text>
              {item.reason ? (
                <Text style={[type.caption, { color: colors.accent }]} numberOfLines={1}>
                  ✨ {item.reason}
                </Text>
              ) : null}
            </View>
            {busyId === item.track.id ? (
              <ActivityIndicator color={colors.accent} style={styles.rowBtn} />
            ) : (
              <IconButton
                icon="swap-horizontal"
                label={`Swap ${item.track.title}`}
                size={20}
                color={colors.textMuted}
                onPress={() => swap(item.track.id)}
              />
            )}
            <IconButton
              icon="close"
              label={`Remove ${item.track.title}`}
              size={20}
              color={colors.textMuted}
              onPress={() => remove(item.track.id)}
            />
          </Pressable>
        )}
      />
      <TextPrompt
        visible={naming}
        title="Playlist name"
        initialValue={draft.name}
        confirmLabel="Save"
        maxLength={60}
        onCancel={() => setNaming(false)}
        onConfirm={save}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page - 10,
    gap: spacing.xs,
  },
  inputContent: {
    paddingHorizontal: spacing.page,
    paddingBottom: PAGE_BOTTOM_PADDING,
    gap: spacing.md,
  },
  hero: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.xs },
  input: { minHeight: 96, borderRadius: radius.lg, padding: spacing.md, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  generate: {
    height: 54,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  working: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  orb: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  track: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: { height: '100%', borderRadius: radius.pill },
  draftHead: { paddingHorizontal: spacing.page, gap: spacing.sm, paddingBottom: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  draftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  save: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  play: { width: 48, height: 48, borderRadius: 24 },
  tweakBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingLeft: spacing.lg,
    paddingRight: 4,
    height: 50,
    marginTop: spacing.sm,
  },
  tweakChips: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.page,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowBtn: { width: 44 },
});
