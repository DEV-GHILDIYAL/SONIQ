import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { GenreTile } from '@/components/GenreTile';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchBar } from '@/components/SearchBar';
import { TrackRow } from '@/components/TrackRow';
import { openTrackActions } from '@/components/trackActionsStore';
import { CONTENT_BOTTOM_PADDING, spacing, tileColors, type, useTheme } from '@/components/theme';
import { GENRES } from '@/lib/genres';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { playQueue } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { searchAll, SOURCE_LABELS, sources } from '@/sources/registry';
import type { SourceId, Track } from '@/sources/types';
import { usePlayerStore } from '@/store/playerStore';

type Filter = 'all' | SourceId;

/** Result of one search request, tagged with the request key it belongs to. */
type SearchResult =
  | { key: string; status: 'done'; tracks: Track[] }
  | { key: string; status: 'error'; message: string };

export default function SearchScreen() {
  const { colors } = useTheme();
  // `q` arrives from Home (genre tiles). Sync it into the field whenever it changes.
  const { q } = useLocalSearchParams<{ q?: string }>();
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

  const onTrackPress = useCallback(
    (track: Track) => {
      void playQueue(tracks, tracks.indexOf(track));
    },
    [tracks],
  );

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
      <ScreenHeader title="Search" />
      <View style={styles.searchBar}>
        <SearchBar value={query} onChangeText={setQuery} />
      </View>

      {!searching ? (
        <ScrollView
          contentContainerStyle={styles.browse}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={[type.heading, styles.sectionTitle, { color: colors.text }]}>
            Browse all
          </Text>
          <View style={styles.grid}>
            {GENRES.map((g, i) => (
              <View key={g.label} style={styles.cell}>
                <GenreTile
                  label={g.label}
                  icon={g.icon}
                  color={tileColors[i % tileColors.length] ?? tileColors[0]}
                  onPress={() => setQuery(g.label)}
                />
              </View>
            ))}
          </View>
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
  searchBar: { paddingHorizontal: spacing.page, paddingBottom: spacing.sm },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.page, paddingVertical: spacing.md },
  browse: { paddingHorizontal: spacing.page, paddingBottom: CONTENT_BOTTOM_PADDING },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  cell: { width: '50%', padding: spacing.xs },
  loader: { marginTop: spacing.xxl },
});
