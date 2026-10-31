import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const BG = '#121110';
const ACCENT = '#FF8A3D';
const LETTERS = 'SONIQ'.split('');

// Keep the native splash up until our animated one is on screen (no white flash).
void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Animated intro on top of the app: the logo pops in, sound rings pulse out,
 * "SONIQ" types itself in, then everything fades away (~1.6 s). The app loads underneath.
 */
export function AnimatedSplash() {
  const [done, setDone] = useState(false);
  const [logo] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => new Animated.Value(0));
  const [word] = useState(() => LETTERS.map(() => new Animated.Value(0)));
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logo, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(ring, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.stagger(
          70,
          word.map((v) =>
            Animated.timing(v, {
              toValue: 1,
              duration: 260,
              easing: Easing.out(Easing.back(2)),
              useNativeDriver: true,
            }),
          ),
        ),
      ]),
      Animated.delay(250),
      Animated.timing(fade, {
        toValue: 0,
        duration: 350,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => setDone(true));
  }, [logo, ring, word, fade]);

  if (done) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}
    >
      <View style={styles.center}>
        {[0, 1].map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.ring,
              {
                opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5 - i * 0.2, 0] }),
                transform: [
                  {
                    scale: ring.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 2 + i * 0.6],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
        <Animated.Image
          source={require('../../assets/splash-icon.png')}
          resizeMode="contain"
          style={[
            styles.logo,
            {
              opacity: logo,
              transform: [
                { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              ],
            },
          ]}
        />
      </View>
      <View style={styles.word}>
        {LETTERS.map((ch, i) => (
          <Animated.Text
            key={ch + i}
            style={[
              styles.letter,
              {
                opacity: word[i],
                transform: [
                  {
                    translateY: (word[i] as Animated.Value).interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {ch}
          </Animated.Text>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  center: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: ACCENT,
  },
  logo: { width: 200, height: 200 },
  word: { flexDirection: 'row', marginTop: 8 },
  letter: { color: '#F5EFE8', fontSize: 30, fontWeight: '900', letterSpacing: 10 },
});
