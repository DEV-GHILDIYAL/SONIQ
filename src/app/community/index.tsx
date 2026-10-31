import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CommunityPlaylistCard } from '@/components/CommunityPlaylistCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { PeopleSkeleton } from '@/components/Skeleton';
import { radius, spacing, type, useTheme } from '@/components/theme';
import { tapHaptic } from '@/lib/haptics';
import {
  discoverPlaylists,
  type DiscoverSort,
  type PublicPlaylistCard,
} from '@/lib/publicPlaylists';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

const PAGE = 20;

type Result =
  { key: string; items: PublicPlaylistCard[]; done: boolean } | { key: string; error: unknown };

/** Browse everyone's public playlists: trending / new, or search by name. */
export default function CommunityScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [sort, setSort] = useState<DiscoverSort>('trending');
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 350);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${sort}|${debounced}|${attempt}`;

  useEffect(() => {
    let cancelled = false;
    discoverPlaylists(sort, debounced, PAGE, 0)
      .then((items) => !cancelled && setResult({ key, items, done: items.length < PAGE }))
      .catch((error: unknown) => !cancelled && setResult({ key, error }));
    return () => {
      cancelled = true;
    };
  }, [sort, debounced, key]);

  const current = result?.key === key ? result : null;

  const loadMore = useCallback(() => {
    if (!current || 'error' in current || current.done || loadingMore) return;
    setLoadingMore(true);
    discoverPlaylists(sort, debounced, PAGE, current.items.length)
      .then((more) =>
        setResult((r) =>
          r && r.key === key && !('error' in r)
            ? {
                key,
                items: [...r.items, ...more.filter((m) => !r.items.some((x) => x.id === m.id))],
                done: more.length < PAGE,
              }
            : r,
        ),
      )
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [current, debounced, key, loadingMore, sort]);

  const tab = (s: DiscoverSort, label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const on = sort === s;
    return (
      <Pressable
        key={s}
        onPress={() => {
          if (on) return;
          tapHaptic();
          setSort(s);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={[styles.tab, on && { backgroundColor: colors.accent }]}
      >
        <Ionicons name={icon} size={15} color={on ? colors.onAccent : colors.textMuted} />
        <Text style={[type.bodyStrong, { color: on ? colors.onAccent : colors.textMuted }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const header = (
    <View style={styles.header}>
      <View style={[styles.search, { backgroundColor: colors.searchField }]}>
        <Ionicons name="search" size={18} color={colors.placeholder} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search playlists"
          placeholderTextColor={colors.placeholder}
          style={[type.body, styles.flex, { color: colors.onSearchField }]}
          returnKeyType="search"
          maxLength={60}
        />
        {query ? (
          <IconButton
            icon="close-circle"
            label="Clear"
            size={18}
            color={colors.placeholder}
            onPress={() => setQuery('')}
          />
        ) : null}
      </View>
      <View style={[styles.tabs, { backgroundColor: colors.surface }]} accessibilityRole="tablist">
        {tab('trending', 'Trending', 'flame')}
        {tab('new', 'New', 'sparkles')}
      </View>
    </View>
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={[type.heading, { color: colors.text }]}>
          Community playlists
        </Text>
      </View>
      {!current ? (
        <>
          {header}
          <PeopleSkeleton rows={6} />
        </>
      ) : 'error' in current ? (
        <>
          {header}
          <ErrorState error={current.error} onRetry={() => setAttempt((n) => n + 1)} />
        </>
      ) : (
        <FlatList
          data={current.items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CommunityPlaylistCard
              card={item}
              layout="row"
              onPress={() => router.push(`/community/${item.id}`)}
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon="albums-outline"
              title={debounced ? `No playlists called “${debounced}”` : 'No public playlists yet'}
              message="Make one of yours public from its page and it shows up here."
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.page - 10,
    gap: spacing.xs,
  },
  header: { paddingHorizontal: spacing.page, gap: spacing.md, paddingBottom: spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    paddingLeft: spacing.md,
    borderRadius: radius.md,
  },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, gap: 4 },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  list: { paddingBottom: spacing.xxl },
});
