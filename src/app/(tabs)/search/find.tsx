import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Artwork } from '@/components/Artwork';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { SearchBar } from '@/components/SearchBar';
import { TrackRow } from '@/components/TrackRow';
import { openTrackActions } from '@/components/trackActionsStore';
import { CONTENT_BOTTOM_PADDING, spacing, type, useTheme } from '@/components/theme';
import { GENRES } from '@/lib/genres';
import { tagGenre } from '@/lib/playContext';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { playQueue } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { searchAll, SOURCE_LABELS, sources } from '@/sources/registry';
import type { SourceId, Track } from '@/sources/types';
import { usePlayerStore } from '@/store/playerStore';
import { topEntries, useProfileStore } from '@/store/profileStore';
import {
  recentKey,
  recentQueries,
  suggestionsFor,
  useSearchHistoryStore,
  type RecentSearch,
} from '@/store/searchHistoryStore';

type Filter = 'all' | SourceId;

/** Result of one search request, tagged with the request key it belongs to. */
type SearchResult =
  | { key: string; status: 'done'; tracks: Track[] }
  | { key: string; status: 'error'; message: string };

/**
 * Full-screen search (opened from the Search tab's field or a genre tile).
 * Empty field: Recent searches. Typing: suggestions + results.
 */
export default function FindScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  // `q` arrives from genre tiles. Sync it into the field whenever it changes.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  // Open straight into typing (unless a genre was passed in).
  useEffect(() => {
    if (q) return;
    const id = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(id);
  }, [q]);
  const [query, setQuery] = useState(q ?? '');
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (q) setQuery(q);
  }
  const [filter, setFilter] = useState<Filter>('all');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const debounced = useDebouncedValue(query.trim(), 350);
  const activeId = usePlayerStore((s) => currentTrack(s.queue)?.id);

  const requestKey = `${filter}|${attempt}|${debounced}`;
  const canSearch = debounced.length > 0 && sources.length > 0;

  useEffect(() => {
    if (!canSearch) return;
    let cancelled = false;
    searchAll(debounced, filter === 'all' ? undefined : [filter])
      .then((tracks) => {
        if (!cancelled) setResult({ key: requestKey, status: 'done', tracks });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setResult({
            key: requestKey,
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [canSearch, debounced, filter, requestKey]);

  // Loading = typing (debounce pending) or the latest request has not answered yet.
  const current = result?.key === requestKey && debounced === query.trim() ? result : null;
  const tracks = useMemo(() => (current?.status === 'done' ? current.tracks : []), [current]);

  const recent = useSearchHistoryStore((s) => s.items);
  const history = useMemo(() => recentQueries(recent), [recent]);
  const recentTracks = useMemo(
    () => recent.flatMap((r) => (r.kind === 'track' ? [r.track] : [])),
    [recent],
  );
  const artistCounts = useProfileStore((s) => s.artistCounts);
  const artists = useMemo(() => topEntries(artistCounts, 50).map(([a]) => a), [artistCounts]);
  const suggestions = useMemo(() => suggestionsFor(query, history, artists), [query, history, artists]);
  const remember = useCallback((text: string) => useSearchHistoryStore.getState().add(text), []);

  const onTrackPress = useCallback(
    (track: Track) => {
      useSearchHistoryStore.getState().addTrack(track);
      // Searching a genre name ("Lo-fi") tags these songs with that genre for listening history.
      const genre = GENRES.find((g) => g.label.toLowerCase() === debounced.toLowerCase())?.label;
      if (genre) tagGenre(tracks.map((t) => t.id), genre);
      void playQueue(tracks, tracks.indexOf(track));
    },
    [tracks, debounced],
  );

  const applySuggestion = (text: string) => {
    setQuery(text);
    remember(text);
  };

  const searching = query.trim().length > 0;

  const chips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      keyboardShouldPersistTaps="handled"
    >
      <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
      {sources.map(({ id }) => (
        <Chip
          key={id}
          label={SOURCE_LABELS[id]}
          selected={filter === id}
          onPress={() => setFilter(id)}
        />
      ))}
    </ScrollView>
  );

  function renderResults() {
    if (sources.length === 0) {
      return (
        <EmptyState
          icon="radio-outline"
          title="No music sources connected yet"
          message="Add a Jamendo client ID or import local files to start searching."
        />
      );
    }
    if (!current) {
      return (
        <ActivityIndicator style={styles.loader} color={colors.accent} testID="search-loading" />
      );
    }
    if (current.status === 'error') {
      return (
        <EmptyState
          icon="cloud-offline-outline"
          title="Something went wrong"
          message={current.message}
          actionLabel="Try again"
          onAction={() => setAttempt((n) => n + 1)}
        />
      );
    }
    return (
      <EmptyState
        icon="search-outline"
        title={`Couldn't find "${debounced}"`}
        message="Try different keywords, or check the spelling."
      />
    );
  }

  return (
    <Screen>
      <View style={styles.searchBar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} style={styles.back} />
        <View style={styles.flex}>
          <SearchBar
          inputRef={inputRef}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => remember(query)}
            placeholder="What do you want to listen to?"
          />
        </View>
      </View>

      {searching && suggestions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.suggestions}
        >
          {suggestions.map((sug) => (
            <Pressable
              key={sug}
              onPress={() => applySuggestion(sug)}
              accessibilityRole="button"
              accessibilityLabel={`Search ${sug}`}
              style={({ pressed }) => [
                styles.suggestion,
                { backgroundColor: pressed ? colors.surfaceHigh : colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons name="search" size={13} color={colors.textMuted} />
              <Text style={[type.caption, { color: colors.text }]} numberOfLines={1}>
                {sug}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {!searching ? (
        <ScrollView
          contentContainerStyle={styles.browse}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {recent.length > 0 ? (
            <>
              <View style={styles.recentHeader}>
                <Text style={[type.heading, { color: colors.text }]}>Recents</Text>
                <Pressable
                  onPress={() => useSearchHistoryStore.getState().clear()}
                  accessibilityRole="button"
                  hitSlop={10}
                >
                  <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>Clear all</Text>
                </Pressable>
              </View>
              {recent.map((r: RecentSearch) => {
                const key = recentKey(r);
                const isTrack = r.kind === 'track';
                const label = isTrack ? r.track.title : r.text;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      if (r.kind === 'query') {
                        applySuggestion(r.text);
                        return;
                      }
                      useSearchHistoryStore.getState().addTrack(r.track);
                      void playQueue(recentTracks, recentTracks.findIndex((x) => x.id === r.track.id));
                    }}
                    onLongPress={isTrack ? () => openTrackActions(r.track) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={isTrack ? `Play ${label} by ${r.track.artist}` : `Search ${label}`}
                    style={({ pressed }) => [styles.recentRow, pressed && { backgroundColor: colors.surface }]}
                  >
                    {isTrack ? (
                      <Artwork seed={r.track.id} uri={r.track.artworkUrl} size={48} />
                    ) : (
                      <View style={[styles.recentIcon, { backgroundColor: colors.surfaceHigh }]}>
                        <Ionicons name="search" size={20} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.flex}>
                      <Text
                        style={[
                          type.body,
                          { color: isTrack && r.track.id === activeId ? colors.accent : colors.text, fontWeight: '600' },
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                        {isTrack ? `Song · ${r.track.artist}` : 'Search'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => useSearchHistoryStore.getState().remove(key)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${label} from recent searches`}
                      hitSlop={10}
                    >
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </>
          ) : null}
          {recent.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="Play what you love"
              message="Search for songs and artists. Your recent searches show up here."
            />
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              active={item.id === activeId}
              onPress={onTrackPress}
              onMore={openTrackActions}
            />
          )}
          ListHeaderComponent={chips}
          ListEmptyComponent={renderResults()}
          contentContainerStyle={{ paddingBottom: CONTENT_BOTTOM_PADDING }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.page - 12,
    paddingRight: spacing.page,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  back: { marginRight: 2 },
  flex: { flex: 1 },
  suggestions: { gap: spacing.sm, paddingHorizontal: spacing.page, paddingBottom: spacing.xs },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 240,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: 6 },
  recentIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.page, paddingVertical: spacing.md },
  browse: { paddingHorizontal: spacing.page, paddingBottom: CONTENT_BOTTOM_PADDING },
  loader: { marginTop: spacing.xxl },
});
