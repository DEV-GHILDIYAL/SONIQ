import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDuration } from '@/lib/format';
import { pressHaptic } from '@/lib/haptics';
import { SOURCE_LABELS } from '@/sources/registry';
import type { Track } from '@/sources/types';
import { useUnplayableOffline } from '@/lib/network';
import { useDownloadStatus } from '@/store/downloadStore';
import { Artwork } from './Artwork';
import { IconButton } from './IconButton';
import { spacing, type, useTheme } from './theme';

type Props = {
  track: Track;
  active?: boolean;
  onPress?: (track: Track) => void;
  /** Long-press and the ⋮ button open the actions sheet. */
  onMore?: (track: Track) => void;
  /** Album pages show a track number instead of artwork. */
  hideArtwork?: boolean;
  leading?: number;
  /** Custom trailing controls (e.g. reorder buttons); replaces the ⋮ button. */
  right?: ReactNode;
};

function TrackRowBase({
  track,
  active = false,
  onPress,
  onMore,
  hideArtwork,
  leading,
  right,
}: Props) {
  const { colors } = useTheme();
  const download = useDownloadStatus(track.id);
  const unplayable = useUnplayableOffline(track);
  return (
    <Pressable
      onPress={() => onPress?.(track)}
      onLongPress={
        onMore
          ? () => {
              pressHaptic();
              onMore(track);
            }
          : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={`${track.title} by ${track.artist}`}
      accessibilityState={{ selected: active, disabled: unplayable }}
      accessibilityHint={unplayable ? 'Not saved for offline' : undefined}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.surface },
        unplayable && styles.dimmed,
      ]}
    >
      {hideArtwork ? (
        <Text
          style={[type.body, styles.number, { color: active ? colors.accent : colors.textMuted }]}
        >
          {leading ?? ''}
        </Text>
      ) : (
        <Artwork seed={track.id} uri={track.artworkUrl} size={52} />
      )}
      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={[type.body, { color: active ? colors.accent : colors.text, fontWeight: '600' }]}
        >
          {track.title}
        </Text>
        <View style={styles.meta}>
          {active ? <Ionicons name="volume-high" size={12} color={colors.accent} /> : null}
          {download === 'done' ? (
            <Ionicons
              name="arrow-down-circle"
              size={13}
              color={colors.accent}
              accessibilityLabel="Downloaded"
            />
          ) : download === 'downloading' || download === 'queued' ? (
            <Ionicons
              name="cloud-download-outline"
              size={13}
              color={colors.textMuted}
              accessibilityLabel="Downloading"
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={[type.caption, styles.metaText, { color: colors.textMuted }]}
          >
            {track.artist} · {SOURCE_LABELS[track.source]}
          </Text>
        </View>
      </View>
      {track.durationSec > 0 && !right ? (
        <Text style={[type.caption, styles.duration, { color: colors.textMuted }]}>
          {formatDuration(track.durationSec)}
        </Text>
      ) : null}
      {right ??
        (onMore ? (
          <IconButton
            icon="ellipsis-vertical"
            label={`More options for ${track.title}`}
            size={18}
            color={colors.textMuted}
            onPress={() => onMore(track)}
            style={styles.more}
          />
        ) : null)}
    </Pressable>
  );
}

export const TrackRow = memo(TrackRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.sm,
    minHeight: 68,
  },
  text: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flexShrink: 1 },
  number: { width: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  duration: { fontVariant: ['tabular-nums'] },
  // Pull the 44px icon box so the glyph lines up with the page gutter.
  more: { marginRight: -14, marginLeft: -6 },
  // Offline and not saved: still tappable (it may be cached) but clearly secondary.
  dimmed: { opacity: 0.4 },
});
