import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { formatDuration } from '@/lib/format';
import {
  cycleRepeat,
  next,
  pause,
  prev,
  resume,
  retry,
  seek,
  setVolume,
  toggleShuffle,
} from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { useIsLiked, useLikedStore } from '@/store/likedStore';
import { usePlayerStore } from '@/store/playerStore';
import { Artwork } from '../Artwork';
import { radius, spacing, type, useTheme } from '../theme';
import { hov, PLAYER_BAR_HEIGHT } from './useIsDesktop';

type IconName = keyof typeof Ionicons.glyphMap;

/** A horizontal bar you can click or drag to set a value 0..1 (seek, volume). */
function Slider({
  value,
  onChange,
  color,
  track,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
  track: string;
  label: string;
}) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(false);
  const at = (x: number) => (width > 0 ? Math.max(0, Math.min(1, x / width)) : 0);
  const v = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => onChange(at(e.nativeEvent.locationX))}
      onResponderMove={(e) => onChange(at(e.nativeEvent.locationX))}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={styles.sliderHit}
    >
      {/* Children ignore the pointer so locationX is measured on the whole bar. */}
      <View pointerEvents="none" style={[styles.sliderTrack, { backgroundColor: track }]}>
        <View style={[styles.sliderFill, { width: `${v * 100}%`, backgroundColor: color }]} />
      </View>
      {hover ? (
        <View
          pointerEvents="none"
          style={[styles.sliderThumb, { left: Math.max(0, v * width - 6), backgroundColor: color }]}
        />
      ) : null}
    </View>
  );
}

function Ctrl({
  icon,
  label,
  onPress,
  active,
  disabled,
  size = 22,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(s) => [styles.ctrl, { opacity: disabled ? 0.35 : hov(s) ? 1 : 0.85 }]}
    >
      <Ionicons name={icon} size={size} color={active ? colors.accent : colors.text} />
    </Pressable>
  );
}

/** Desktop now-playing bar: song, controls + progress, like / queue / volume. */
export function PlayerBar() {
  const { colors } = useTheme();
  const router = useRouter();
  const track = usePlayerStore((s) => currentTrack(s.queue));
  const status = usePlayerStore((s) => s.status);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const volume = usePlayerStore((s) => s.volume ?? 1);
  const position = usePlayerStore((s) => s.positionSec);
  const duration = usePlayerStore((s) => s.durationSec);
  const liked = useIsLiked(track?.id);
  const [lastVolume, setLastVolume] = useState(1);

  const playing = status === 'playing';
  const length = duration > 0 ? duration : (track?.durationSec ?? 0);
  const toggle = () => {
    if (!track) return;
    if (status === 'error') void retry();
    else if (playing) pause();
    else resume();
  };
  const mute = () => {
    if (volume > 0) {
      setLastVolume(volume);
      setVolume(0);
    } else setVolume(lastVolume || 1);
  };

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {/* Song */}
      <View style={styles.left}>
        {track ? (
          <>
            <Pressable
              onPress={() => router.push('/player')}
              accessibilityRole="button"
              accessibilityLabel="Open player"
            >
              <Artwork seed={track.id} uri={track.artworkUrl} size={56} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/player')}
              accessibilityRole="button"
              style={styles.songText}
            >
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                {track.artist}
              </Text>
            </Pressable>
            <Ctrl
              icon={liked ? 'heart' : 'heart-outline'}
              label={liked ? 'Unlike' : 'Like'}
              active={liked}
              size={20}
              onPress={() => useLikedStore.getState().toggle(track)}
            />
          </>
        ) : (
          <Text style={[type.caption, { color: colors.textFaint }]}>Pick a song to play</Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.center}>
        <View style={styles.controls}>
          <Ctrl icon="shuffle" label="Shuffle" active={shuffle} size={20} onPress={toggleShuffle} />
          <Ctrl
            icon="play-skip-back"
            label="Previous"
            disabled={!track}
            onPress={() => void prev()}
          />
          <Pressable
            onPress={toggle}
            disabled={!track}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            style={(s) => [
              styles.play,
              {
                backgroundColor: colors.text,
                opacity: !track ? 0.35 : 1,
                transform: [{ scale: hov(s) ? 1.06 : 1 }],
              },
            ]}
          >
            <Ionicons
              name={status === 'error' ? 'refresh' : playing ? 'pause' : 'play'}
              size={20}
              color={colors.background}
              style={!playing && status !== 'error' ? styles.playNudge : undefined}
            />
          </Pressable>
          <Ctrl
            icon="play-skip-forward"
            label="Next"
            disabled={!track}
            onPress={() => void next()}
          />
          <Ctrl
            icon="repeat"
            label={`Repeat ${repeat}`}
            active={repeat !== 'off'}
            size={20}
            onPress={cycleRepeat}
          />
        </View>
        <View style={styles.progress}>
          <Text style={[styles.time, { color: colors.textMuted }]}>{formatDuration(position)}</Text>
          <View style={styles.flex}>
            <Slider
              value={length > 0 ? position / length : 0}
              onChange={(v) => length > 0 && void seek(v * length)}
              color={colors.accent}
              track={colors.surfaceHigh}
              label="Seek"
            />
          </View>
          <Text style={[styles.time, { color: colors.textMuted }]}>
            {length > 0 ? formatDuration(length) : '--:--'}
          </Text>
        </View>
      </View>

      {/* Extras */}
      <View style={styles.right}>
        <Ctrl icon="list" label="Queue" size={20} onPress={() => router.push('/queue')} />
        <Ctrl
          icon={volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
          label={volume === 0 ? 'Unmute' : 'Mute'}
          size={20}
          onPress={mute}
        />
        <View style={styles.volume}>
          <Slider
            value={volume}
            onChange={setVolume}
            color={colors.text}
            track={colors.surfaceHigh}
            label="Volume"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    height: PLAYER_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.lg,
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  songText: { flexShrink: 1, minWidth: 0 },
  center: { flex: 1.4, alignItems: 'center', gap: 4, maxWidth: 720 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ctrl: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  playNudge: { marginLeft: 2 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: '100%' },
  time: { fontSize: 11, fontWeight: '600', width: 40, textAlign: 'center' },
  right: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  volume: { width: 110 },
  sliderHit: { height: 16, justifyContent: 'center' },
  sliderTrack: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  sliderFill: { height: '100%' },
  sliderThumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, top: 2 },
});
