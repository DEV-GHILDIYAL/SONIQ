import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Artwork } from '@/components/Artwork';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { TrackListSkeleton } from '@/components/Skeleton';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { SearchBar } from '@/components/SearchBar';
import { TrackRow } from '@/components/TrackRow';
import { openTrackActions } from '@/components/trackActionsStore';
import { CONTENT_BOTTOM_PADDING, spacing, type, useTheme } from '@/components/theme';
import { useIsDesktop } from '@/components/desktop/useIsDesktop';
import { GENRES } from '@/lib/genres';
import { tagGenre } from '@/lib/playContext';
import { useNetworkStore } from '@/lib/network';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { playQueue } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import {
  searchAllWithBatches,
  searchCacheKey,
  SOURCE_LABELS,
  sources,
  type SearchBatch,
} from '@/sources/registry';
import type { SourceId, Track } from '@/sources/types';
import { usePlayerStore } from '@/store/playerStore';
import { useSearchCacheStore } from '@/store/searchCacheStore';
import { topEntries, useProfileStore } from '@/store/profileStore';
import {
  recentKey,
  recentQueries,
  suggestionsFor,
  useSearchHistoryStore,
  type RecentSearch,
} from '@/store/searchHistoryStore';

type Filter = 'all' | SourceId;

type SearchResult = {
  key: string;
  tracks: Track[];
  status: 'loading' | 'done' | 'error';
  message?: string;
  updating: boolean;
  saved: boolean;
};

const EMPTY_TRACKS: Track[] = [];

function appendUnique(current: readonly Track[], incoming: readonly Track[]): Track[] {
  const seen = new Set(current.map((t) => t.id));
  const out = [...current];
  for (const t of incoming) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/**
 * Full-screen search (opened from the Search tab's field or a genre tile).
 * Empty field: Recent searches. Typing: suggestions + results.
 */
export default function FindScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const desktop = useIsDesktop();
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
  const [live, setLive] = useState<SearchResult | null>(null);
  const [flushed, setFlushed] = useState<{ query: string; text: string } | null>(null);
  const debounced = useDebouncedValue(query.trim(), 250);
  const activeQuery = flushed?.query === query ? flushed.text : debounced;
  const offline = useNetworkStore((s) => s.offline);
  const activeId = usePlayerStore((s) => currentTrack(s.queue)?.id);

  const requestKey = `${filter}|${attempt}|${activeQuery}`;
  const savedKey = searchCacheKey(activeQuery, filter === 'all' ? undefined : [filter]);
  const canSearch = activeQuery.length > 0 && sources.length > 0;
  const savedHit = useSearchCacheStore((s) => s.items[savedKey]);
  const savedTracks = savedHit?.tracks ?? EMPTY_TRACKS;

  const result = useMemo<SearchResult | null>(() => {
    if (live?.key === requestKey) return live;
    if (savedTracks.length > 0) {
      return { key: requestKey, tracks: savedTracks, status: 'done', updating: true, saved: true };
    }
    if (live && live.tracks.length > 0) return { ...live, key: requestKey, updating: true };
    return null;
  }, [live, requestKey, savedTracks]);

  useEffect(() => {
    if (!canSearch) return;
    const controller = new AbortController();
    let liveBatches = 0;
    const onBatch = (batch: SearchBatch) => {
      if (controller.signal.aborted) return;
      const replacing = batch.replace ?? liveBatches === 0;
      liveBatches += 1;
      setLive((prev) => {
        const base = prev?.key === requestKey && !replacing ? prev.tracks : [];
        const tracks = replacing ? batch.tracks : appendUnique(base, batch.tracks);
        return { key: requestKey, tracks, status: 'done', updating: true, saved: false };
      });
    };
    searchAllWithBatches(
      activeQuery,
      filter === 'all' ? undefined : [filter],
      20,
      onBatch,
      controller.signal,
    )
      .then(() => {
        if (controller.signal.aborted) return;
        setLive((prev) =>
          prev?.key === requestKey
            ? { ...prev, updating: false, saved: false }
            : { key: requestKey, tracks: [], status: 'done', updating: false, saved: false },
        );
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLive((prev) => ({
          key: requestKey,
          tracks: prev?.key === requestKey ? prev.tracks : [],
          status: prev?.key === requestKey && prev.tracks.length > 0 ? 'done' : 'error',
          message: err instanceof Error ? err.message : String(err),
          updating: false,
          saved: false,
        }));
      });
    return () => controller.abort();
  }, [activeQuery, canSearch, filter, requestKey]);

  const tracks = useMemo(() => (canSearch ? (result?.tracks ?? []) : []), [canSearch, result]);
  const pending = canSearch && (result?.key !== requestKey || activeQuery !== query.trim());
  const showSkeleton = !result || result.status === 'loading' || (tracks.length === 0 && pending);
  const updating = !!result && (result.updating || pending) && !showSkeleton;
  const errorMessage =
    result?.status === 'error' && result.key === requestKey ? result.message : undefined;

  const recent = useSearchHistoryStore((s) => s.items);
  const history = useMemo(() => recentQueries(recent), [recent]);
  const artistCounts = useProfileStore((s) => s.artistCounts);
  const artists = useMemo(() => topEntries(artistCounts, 50).map(([a]) => a), [artistCounts]);
  const suggestions = useMemo(
    () => suggestionsFor(query, history, artists),
    [query, history, artists],
  );
  const remember = useCallback((text: string) => useSearchHistoryStore.getState().add(text), []);

  const onTrackPress = useCallback(
    (track: Track) => {
      useSearchHistoryStore.getState().addTrack(track);
      // Searching a genre name ("Lo-fi") tags these songs with that genre for listening history.
      const genre = GENRES.find((g) => g.label.toLowerCase() === activeQuery.toLowerCase())?.label;
      if (genre)
        tagGenre(
          tracks.map((t) => t.id),
          genre,
        );
      // Just this song: when it ends, autoplay lines up songs picked for this listener
      // (not the next search result). "Play all" plays the whole result list.
      void playQueue([track], 0);
    },
    [tracks, activeQuery],
  );

  const playAll = useCallback(() => {
    if (tracks.length > 0) void playQueue(tracks, 0);
  }, [tracks]);

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
          message="Import songs from your phone in Library to start listening."
        />
      );
    }
    if (showSkeleton || (updating && tracks.length === 0)) {
      return <TrackListSkeleton testID="search-loading" />;
    }
    if (errorMessage) {
      return <ErrorState error={errorMessage} onRetry={() => setAttempt((n) => n + 1)} />;
    }
    if (offline && tracks.length === 0) {
      return (
        <EmptyState
          icon="wifi-outline"
          title="You're offline"
          message="Connect to search new songs, or play a downloaded track."
        />
      );
    }
    return (
      <EmptyState
        icon="search-outline"
        title={`Couldn't find "${activeQuery}"`}
        message="Try different keywords, or check the spelling."
      />
    );
  }

  return (
    <Screen>
      <View style={[styles.searchBar, desktop && styles.searchBarDesktop]}>
        <IconButton
          icon="arrow-back"
          label="Back"
          onPress={() => router.back()}
          style={styles.back}
        />
        <View style={styles.flex}>
          <SearchBar
            inputRef={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => {
              remember(query);
              setFlushed({ query, text: query.trim() });
            }}
            placeholder="What do you want to listen to?"
          />
        </View>
      </View>

      {searching && suggestions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.suggestionRow}
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
                {
                  backgroundColor: pressed ? colors.surfaceHigh : colors.surface,
                  borderColor: colors.border,
                },
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
                  <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>
                    Clear all
                  </Text>
                </Pressable>
              </View>
              {recent.map((r: RecentSearch) => {
                const key = recentKey(r);
                const isTrack = r.kind === 'track';
                const label = isTrack ? r.track.title : r.text;
                return (
                  // Row + sibling remove button: nesting one Pressable in another renders
                  // <button> inside <button> on web (invalid HTML, React warns).
                  <View key={key} style={styles.recentWrap}>
                    <Pressable
                      onPress={() => {
                        if (r.kind === 'query') {
                          applySuggestion(r.text);
                          return;
                        }
                        useSearchHistoryStore.getState().addTrack(r.track);
                        void playQueue([r.track], 0);
                      }}
                      onLongPress={isTrack ? () => openTrackActions(r.track) : undefined}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isTrack ? `Play ${label} by ${r.track.artist}` : `Search ${label}`
                      }
                      style={({ pressed }) => [
                        styles.recentRow,
                        styles.flex,
                        pressed && { backgroundColor: colors.surface },
                      ]}
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
                            {
                              color:
                                isTrack && r.track.id === activeId ? colors.accent : colors.text,
                              fontWeight: '600',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                          {isTrack ? `Song · ${r.track.artist}` : 'Search'}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => useSearchHistoryStore.getState().remove(key)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${label} from recent searches`}
                      hitSlop={10}
                    >
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
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
          ListHeaderComponent={
            <>
              {chips}
              {updating ? (
                <View style={styles.statusHead}>
                  <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    {offline
                      ? 'Offline · saved results'
                      : result?.saved
                        ? 'Saved · updating…'
                        : 'Updating…'}
                  </Text>
                </View>
              ) : null}
              {tracks.length > 1 ? (
                <View style={styles.resultsHead}>
                  <Text style={[type.caption, styles.flex, { color: colors.textMuted }]}>
                    {tracks.length} songs
                  </Text>
                  <Pressable
                    onPress={playAll}
                    accessibilityRole="button"
                    accessibilityLabel="Play all results"
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.playAll,
                      { backgroundColor: colors.surfaceHigh, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Ionicons name="play" size={14} color={colors.text} />
                    <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                      Play all
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          }
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
  // A horizontal list in a column must not grow or shrink (it got cut off on PC).
  suggestionRow: { flexGrow: 0, flexShrink: 0 },
  resultsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    paddingBottom: spacing.sm,
  },
  playAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.page - 12,
    paddingRight: spacing.page,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  // Desktop: reduce left padding (sidebar already provides the offset) and
  // ensure the row never overflows the content area.
  searchBarDesktop: {
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    overflow: 'hidden',
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
  recentWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingVertical: 6,
  },
  recentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.page, paddingVertical: spacing.md },
  statusHead: { paddingHorizontal: spacing.page, paddingBottom: spacing.xs },
  browse: { paddingHorizontal: spacing.page, paddingBottom: CONTENT_BOTTOM_PADDING },
});
