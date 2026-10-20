import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import {
  CONTENT_BOTTOM_PADDING,
  radius,
  spacing,
  type,
  useTheme,
  withAlpha,
} from '@/components/theme';

/** Teaser lines that "sing" one after another with a karaoke fill sweep. */
const LINES = ['Turn the vocals down.', 'Turn your voice up.', 'Every song is your stage.'];
const BARS = 18;
const FEATURES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'mic-off-outline', label: 'Vocal remover' },
  { icon: 'text-outline', label: 'Live lyrics' },
  { icon: 'trophy-outline', label: 'Singing score' },
  { icon: 'people-outline', label: 'Duets in Jam' },
];

function useLoop(duration: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}

/** Expanding rings around the mic. */
function Ring({ delay, color }: { delay: number; color: string }) {
  const t = useLoop(2400, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          borderColor: color,
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
        },
      ]}
    />
  );
}

/** One equalizer bar bouncing at its own speed. */
function Bar({ index, color }: { index: number; color: string }) {
  const v = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const speed = 260 + ((index * 97) % 340);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0.15 + ((index * 13) % 30) / 100,
          duration: speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, index]);
  return (
    <Animated.View style={[styles.bar, { backgroundColor: color, transform: [{ scaleY: v }] }]} />
  );
}

/** A lyric line filling up with colour from left to right, like karaoke. */
function SingingLine({
  text,
  active,
  fill,
  base,
  hot,
}: {
  text: string;
  active: boolean;
  fill: Animated.Value;
  base: string;
  hot: string;
}) {
  const [w, setW] = useState(0);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={styles.lineWrap}>
      <Text style={[styles.line, { color: base }]}>{text}</Text>
      {active ? (
        <Animated.View
          style={[
            styles.lineFill,
            { width: fill.interpolate({ inputRange: [0, 1], outputRange: [0, w] }) },
          ]}
        >
          <Text numberOfLines={1} style={[styles.line, { color: hot, width: w }]}>
            {text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function KaraokeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const glow = useLoop(3200);
  const fill = useRef(new Animated.Value(0)).current;
  const [line, setLine] = useState(0);
  const [notified, setNotified] = useState(false);

  // Sing the lines one by one, forever.
  useEffect(() => {
    let stopped = false;
    const sing = (i: number) => {
      if (stopped) return;
      setLine(i);
      fill.setValue(0);
      Animated.timing(fill, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setTimeout(() => sing((i + 1) % LINES.length), 500);
      });
    };
    sing(0);
    return () => {
      stopped = true;
      fill.stopAnimation();
    };
  }, [fill]);

  return (
    <Screen>
      <View style={styles.backBar}>
        <IconButton
          icon="arrow-back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.stage}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glow,
              {
                backgroundColor: withAlpha(colors.accent, 0.18),
                transform: [
                  {
                    scale: glow.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.85, 1.15, 0.85],
                    }),
                  },
                ],
              },
            ]}
          />
          <Ring delay={0} color={colors.accent} />
          <Ring delay={800} color={colors.accent} />
          <Ring delay={1600} color={colors.accent} />
          <View style={[styles.mic, { backgroundColor: colors.accent }]}>
            <Ionicons name="mic" size={56} color={colors.onAccent} />
          </View>
        </View>

        <View style={styles.bars}>
          {Array.from({ length: BARS }, (_, i) => (
            <Bar
              key={i}
              index={i}
              color={i % 3 === 0 ? colors.accent : withAlpha(colors.accent, 0.55)}
            />
          ))}
        </View>

        <Text style={[styles.badge, { color: colors.accent, borderColor: colors.accent }]}>
          COMING SOON
        </Text>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          KARAOKE
        </Text>
        <Text style={[type.body, styles.tagline, { color: colors.textMuted }]}>
          You've never seen this in a music app.{'\n'}Any song. Your voice. Live.
        </Text>

        <View style={[styles.lyrics, { backgroundColor: colors.surface }]}>
          {LINES.map((l, i) => (
            <SingingLine
              key={l}
              text={l}
              active={i === line}
              fill={fill}
              base={i === line ? colors.text : colors.textFaint}
              hot={colors.accent}
            />
          ))}
        </View>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View
              key={f.label}
              style={[
                styles.feature,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons name={f.icon} size={18} color={colors.accent} />
              <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                {f.label}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => setNotified(true)}
          disabled={notified}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.notify,
            {
              backgroundColor: notified ? colors.surfaceHigh : colors.accent,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons
            name={notified ? 'checkmark-circle' : 'notifications'}
            size={20}
            color={notified ? colors.accent : colors.onAccent}
          />
          <Text style={[type.bodyStrong, { color: notified ? colors.text : colors.onAccent }]}>
            {notified ? "You're on the list 🎤" : 'Notify me when it drops'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const STAGE = 220;

const styles = StyleSheet.create({
  backBar: { paddingHorizontal: spacing.page - 10, paddingVertical: spacing.xs },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.page,
    paddingTop: spacing.xl,
    paddingBottom: CONTENT_BOTTOM_PADDING,
  },
  stage: { width: STAGE, height: STAGE, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: STAGE, height: STAGE, borderRadius: STAGE / 2 },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2 },
  mic: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 48, marginTop: spacing.sm },
  bar: { width: 6, height: 48, borderRadius: 3 },
  badge: {
    marginTop: spacing.xl,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  title: { fontSize: 52, fontWeight: '900', letterSpacing: 6, marginTop: spacing.sm },
  tagline: { textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  lyrics: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  lineWrap: { alignSelf: 'flex-start' },
  line: { fontSize: 20, fontWeight: '800' },
  lineFill: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notify: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    marginTop: spacing.xl,
  },
});
