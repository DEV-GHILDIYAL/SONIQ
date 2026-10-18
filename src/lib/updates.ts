/**
 * "New version available" check. The latest release lives in the Supabase table
 * `app_releases` (version, notes, apk_url — see docs/backend.md). Updating is optional.
 */
import Constants from 'expo-constants';
import { getSupabase, supabaseConfigured } from './supabase';

export interface AppRelease {
  version: string;
  notes: string;
  apkUrl: string;
}

export const currentVersion = (): string => Constants.expoConfig?.version ?? '0.0.0';

/** -1 / 0 / 1 like a comparator, for "1.10.0" style versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** The newest release if it is newer than this app, else null. Never throws. */
export async function checkForUpdate(): Promise<AppRelease | null> {
  if (!supabaseConfigured()) return null;
  try {
    const { data, error } = await getSupabase()
      .from('app_releases')
      .select('version, notes, apk_url')
      .order('created_at', { ascending: false })
      .limit(1);
    const row = data?.[0] as { version?: string; notes?: string; apk_url?: string } | undefined;
    if (error || !row?.version || !row.apk_url) return null;
    if (compareVersions(row.version, currentVersion()) <= 0) return null;
    return { version: row.version, notes: row.notes ?? '', apkUrl: row.apk_url };
  } catch {
    return null;
  }
}
