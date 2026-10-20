/**
 * AsyncStorage wrapper for persisted stores.
 *
 * Zustand's `persist` writes on EVERY state change, even when the persisted part didn't
 * change (e.g. the player position ticks twice a second but only shuffle/repeat are saved).
 * This wrapper skips writes of an unchanged value and batches the rest (WRITE_DELAY_MS),
 * flushing right away when the app goes to the background so nothing is lost.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

const WRITE_DELAY_MS = 500;

/** Last value known to be on disk, per key. */
const onDisk = new Map<string, string>();
/** Values waiting to be written. */
const pending = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (pending.size === 0) return;
  const batch = [...pending.entries()];
  pending.clear();
  try {
    await AsyncStorage.multiSet(batch);
    for (const [key, value] of batch) onDisk.set(key, value);
  } catch (err) {
    // Put them back (unless something newer arrived) and try again later.
    for (const [key, value] of batch) if (!pending.has(key)) pending.set(key, value);
    console.warn('[storage] write failed, will retry:', err);
    timer = setTimeout(() => void flush(), WRITE_DELAY_MS * 4);
  }
}

AppState.addEventListener('change', (state) => {
  if (state !== 'active') void flush();
});

export const appStorage: StateStorage = {
  async getItem(key) {
    const waiting = pending.get(key);
    if (waiting !== undefined) return waiting;
    const value = await AsyncStorage.getItem(key);
    if (value !== null) onDisk.set(key, value);
    return value;
  },
  setItem(key, value) {
    if (pending.get(key) === value) return;
    if (!pending.has(key) && onDisk.get(key) === value) return;
    pending.set(key, value);
    timer ??= setTimeout(() => void flush(), WRITE_DELAY_MS);
  },
  async removeItem(key) {
    pending.delete(key);
    onDisk.delete(key);
    await AsyncStorage.removeItem(key);
  },
};

/** Write everything now (e.g. before a restore replaces the stores). */
export const flushAppStorage = flush;
