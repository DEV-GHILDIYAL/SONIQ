import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { isDiwaliDay } from '@/lib/festival';

const SPARKS = ['🎆', '✨', '🎇', '🪔', '✨', '🎆', '🌟', '🎇', '✨', '🪔', '🎆', '✨', '🎇', '🌟'];
const DURATION = 2_400;

/** Diwali day, first open: a short burst of fireworks over the app. Shown once a year. */
export function FestivalBurst() {
  const { width, height } = useWindowDimensions();
  const [show, setShow] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!isDiwaliDay()) return;
    const key = `soniq:diwali-burst:${new Date().getFullYear()}`;
    let cancelled = false;
    void AsyncStorage.getItem(key)
      .then((seen) => {
        if (seen || cancelled) return;
        void AsyncStorage.setItem(key, '1');
        setShow(true);
        Animated.timing(progress, {
          toValue: 1,
          duration: DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => setShow(false));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [progress]);

  // Random-ish but stable positions for this mount.
  const sparks = useMemo(
    () =>
      SPARKS.map((e, i) => ({
        e,
        x: ((i * 37) % 100) / 100,
        rise: 0.35 + ((i * 53) % 40) / 100,
        size: 26 + ((i * 17) % 22),
        delay: (i % 5) * 0.08,
      })),
    [],
  );

  if (!show) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {sparks.map((s, i) => {
        const p = progress.interpolate({
          inputRange: [0, s.delay, 1],
          outputRange: [0, 0, 1],
        });
        const translateY = p.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -height * s.rise],
        });
        const scale = p.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.2, 0.9] });
        const opacity = p.interpolate({
          inputRange: [0, 0.15, 0.75, 1],
          outputRange: [0, 1, 1, 0],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.spark,
              {
                left: s.x * (width - 40),
                bottom: 40,
                opacity,
                transform: [{ translateY }, { scale }],
              },
            ]}
          >
            <Text style={{ fontSize: s.size }}>{s.e}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  spark: { position: 'absolute' },
});
