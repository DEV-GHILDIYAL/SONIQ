/**
 * "New version available" check. Checks GitHub Releases first (public & free CDN),
 * falling back to Supabase table `app_releases` if GitHub is unavailable.
 */
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { Linking, Platform } from 'react-native';
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

// ---- "What's new" ----

export interface ReleaseNotes {
  tagline?: string;
  items: string[];
}

/**
 * Turn release markdown into a short tagline + bullet list. Drops headings, links, URLs and
 * GitHub's auto-generated "Full Changelog" / "New Contributors" lines.
 */
export function parseNotes(notes: string): ReleaseNotes {
  const clean = (line: string) =>
    line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) -> text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+by @\S+.*$/i, '') // "by @user in #12"
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  let tagline: string | undefined;
  const items: string[] = [];
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^#+\s/.test(line) || /full changelog|new contributors|what's changed/i.test(line)) continue;
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const text = clean(bullet ? (bullet[1] ?? '') : line);
    if (text.length < 2) continue;
    if (bullet) items.push(text);
    else if (!tagline && items.length === 0) tagline = text;
  }
  return { tagline, items };
}

// ---- In-app download + install (Android) ----

export interface UpdateDownload {
  /** Resolves with the downloaded APK's file:// URI. */
  promise: Promise<string>;
  cancel: () => void;
}

const updatesDir = () => new Directory(Paths.cache, 'updates');

/** Download the APK inside the app with progress (0..1). Reuses a finished earlier download. */
export function downloadUpdate(release: AppRelease, onProgress: (fraction: number) => void): UpdateDownload {
  const controller = new AbortController();
  const promise = (async () => {
    const dir = updatesDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const name = `SONIQ-${release.version}.apk`;
    // Old update files only waste space.
    for (const entry of dir.list()) {
      if (entry instanceof File && entry.name !== name) {
        try {
          entry.delete();
        } catch {
          // ignore
        }
      }
    }
    const target = new File(dir, name);
    const done = new File(dir, `${name}.done`);
    if (target.exists && done.exists && target.size > 0) {
      onProgress(1);
      return target.uri;
    }
    for (const f of [target, done]) if (f.exists) f.delete();
    const task = File.createDownloadTask(release.apkUrl, target, {
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) onProgress(Math.min(1, bytesWritten / totalBytes));
      },
    });
    try {
      const file = await task.downloadAsync();
      if (!file || !file.exists || file.size === 0) throw new Error('Download did not finish');
      done.create();
      onProgress(1);
      return file.uri;
    } catch (err) {
      try {
        if (target.exists) target.delete();
      } catch {
        // ignore
      }
      throw err;
    }
  })();
  return { promise, cancel: () => controller.abort() };
}

/** Open Android's "Install" screen for the downloaded APK. */
export async function installUpdate(fileUri: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Lazy: keeps the native module out of tests and iOS.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getContentUriAsync } = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { startActivityAsync } = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
  const contentUri = await getContentUriAsync(fileUri);
  await startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}

/** Browser download, used when the in-app download fails. */
export function openApkInBrowser(release: AppRelease): void {
  void Linking.openURL(release.apkUrl);
}
