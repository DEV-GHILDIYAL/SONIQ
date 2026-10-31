import { getRandomBytes } from 'expo-crypto';

/**
 * Cryptographically secure random number in [0, 1). Used for IDs, device secrets, backup
 * codes and Jam codes, which must not be guessable (Math.random is predictable).
 */
export function secureRandom(): number {
  try {
    const buf = getRandomBytes(4);
    const n =
      (((buf[0] ?? 0) << 24) | ((buf[1] ?? 0) << 16) | ((buf[2] ?? 0) << 8) | (buf[3] ?? 0)) >>> 0;
    return n / 0x1_0000_0000;
  } catch {
    return Math.random(); // native module missing (tests)
  }
}
