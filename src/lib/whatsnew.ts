/**
 * Release notes bundled with the app (docs/changelog -> whatsnew.generated.ts) and the
 * "you just updated" check.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { compareVersions, currentVersion } from './updates';
import { RELEASES } from './whatsnew.generated';

export { RELEASES };

const SEEN_KEY = 'soniq:whatsnew-seen';

export async function markWhatsNewSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, currentVersion());
  } catch {
    // best effort
  }
}

/**
 * The version whose notes should be offered ("Updated to vX"), or null.
 * `existingUser`: true when this phone already had SONIQ set up before this launch
 * (so a missing record means "updated from an older version", not "fresh install").
 */
export async function pendingWhatsNew(existingUser: boolean): Promise<string | null> {
  const now = currentVersion();
  if (!RELEASES.some((r) => r.version === now)) return null;
  let seen: string | null = null;
  try {
    seen = await AsyncStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
  if (seen === null && !existingUser) {
    await markWhatsNewSeen(); // fresh install: nothing "new" yet
    return null;
  }
  if (seen !== null && compareVersions(seen, now) >= 0) return null;
  return now;
}
