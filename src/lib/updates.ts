/**
 * "New version available" check. Checks GitHub Releases first (public & free CDN),
 * falling back to Supabase table `app_releases` if GitHub is unavailable.
 */
import Constants from 'expo-constants';
import { fetchJson } from './fetch';
import { getSupabase, supabaseConfigured } from './supabase';

const GITHUB_REPO = 'DEV-GHILDIYAL/SONIQ';
const GITHUB_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface AppRelease {
  version: string;
  notes: string;
  apkUrl: string;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubReleaseResponse {
  tag_name?: string;
  name?: string;
  body?: string;
  assets?: GitHubAsset[];
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

/** Check GitHub Releases for the latest APK. */
async function checkGitHubUpdate(): Promise<AppRelease | null> {
  try {
    const data = await fetchJson<GitHubReleaseResponse>(GITHUB_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'SONIQ-App',
      },
      timeoutMs: 6000,
    });
    if (!data?.tag_name) return null;
    const version = data.tag_name.replace(/^v/i, '').trim();
    if (compareVersions(version, currentVersion()) <= 0) return null;

    // Find the APK file among the release assets
    const apk = data.assets?.find((a) => a.name.toLowerCase().endsWith('.apk'));
    if (!apk?.browser_download_url) return null;

    return {
      version,
      notes: data.body?.trim() ?? '',
      apkUrl: apk.browser_download_url,
    };
  } catch {
    return null;
  }
}

/** Fallback check via Supabase table app_releases. */
async function checkSupabaseUpdate(): Promise<AppRelease | null> {
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

/** The newest release if it is newer than this app, else null. Never throws. */
export async function checkForUpdate(): Promise<AppRelease | null> {
  // 1. Try GitHub Releases first (free, public CDN, automatic)
  const github = await checkGitHubUpdate();
  if (github) return github;

  // 2. Fallback to Supabase app_releases table
  return checkSupabaseUpdate();
}
