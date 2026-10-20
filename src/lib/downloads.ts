/**
 * Song downloads: one at a time, saved permanently, played offline.
 * The player resolves through resolveStream(), which prefers a downloaded file.
 */
import { getPlaybackSource, getStreamUrl } from '@/sources/registry';
import type { PlaybackSource, Track } from '@/sources/types';
import { useDownloadStore } from '@/store/downloadStore';
import {
  copySongToFolder,
  deleteSongFile,
  pickPhoneFolder,
  saveSongFile,
  songFileExists,
} from './downloadFiles';

const AUDIO_EXT = /\.(m4a|mp3|mp4|webm|opus|ogg|oga|flac|aac|wav)(?:$|[?#])/i;

/** Local files already live on the phone. */
export const canDownload = (track: Track) => track.source !== 'local';

const fileNameFor = (track: Track, source: string) => {
  const ext = AUDIO_EXT.exec(source)?.[1]?.toLowerCase() ?? 'mp3';
  return `${track.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

let running = false;

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = useDownloadStore.getState().pending[0];
      if (!next) break;
      useDownloadStore.setState({ active: next.id });
      try {
        const source = await getStreamUrl(next);
        const saved = await saveSongFile(source, fileNameFor(next, source));
        if (saved.bytes <= 0) throw new Error('Downloaded file is empty');
        useDownloadStore.setState((s) => ({
          items: { ...s.items, [next.id]: { track: next, uri: saved.uri, bytes: saved.bytes, at: Date.now() } },
        }));
      } catch (err) {
        useDownloadStore.setState((s) => ({ failed: { ...s.failed, [next.id]: errorText(err) } }));
      } finally {
        useDownloadStore.setState((s) => ({
          active: null,
          pending: s.pending.filter((t) => t.id !== next.id),
        }));
      }
    }
  } finally {
    running = false;
  }
}

/** Queue tracks for download. Skips local files, finished and already queued ones. Returns how many were queued. */
export function downloadTracks(tracks: readonly Track[]): number {
  const s = useDownloadStore.getState();
  const queued = new Set(s.pending.map((t) => t.id));
  const fresh = tracks.filter((t) => canDownload(t) && !s.items[t.id] && !queued.has(t.id) && queued.add(t.id));
  if (fresh.length === 0) return 0;
  const failed = { ...s.failed };
  for (const t of fresh) delete failed[t.id];
  useDownloadStore.setState({ pending: [...s.pending, ...fresh], failed });
  void drain();
  return fresh.length;
}

export const downloadTrack = (track: Track) => downloadTracks([track]) > 0;

/** Delete a finished download, or drop a queued one. */
export function removeDownload(trackId: string): void {
  const s = useDownloadStore.getState();
  const item = s.items[trackId];
  if (item) deleteSongFile(item.uri);
  const items = { ...s.items };
  delete items[trackId];
  useDownloadStore.setState({
    items,
    pending: s.active === trackId ? s.pending : s.pending.filter((t) => t.id !== trackId),
  });
}

/** file:// URI of a downloaded track, or null. Forgets entries whose file was deleted. */
export function getDownloadedUri(trackId: string): string | null {
  const item = useDownloadStore.getState().items[trackId];
  if (!item) return null;
  if (songFileExists(item.uri)) return item.uri;
  removeDownload(trackId);
  return null;
}

/** Stream resolver for the player: downloaded file first, then the source (direct stream). */
export async function resolveStream(
  track: Track,
  options?: { preferDownload?: boolean },
): Promise<PlaybackSource> {
  const local = getDownloadedUri(track.id);
  if (local) return { uri: local };
  return getPlaybackSource(track, options);
}

/** Resolves when the track finished downloading; rejects if it failed or was removed. */
function waitForDownload(trackId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const s = useDownloadStore.getState();
      const item = s.items[trackId];
      if (item) {
        resolve(item.uri);
        return true;
      }
      const failed = s.failed[trackId];
      if (failed) {
        reject(new Error(failed));
        return true;
      }
      if (s.active !== trackId && !s.pending.some((t) => t.id === trackId)) {
        reject(new Error('Download was cancelled'));
        return true;
      }
      return false;
    };
    if (check()) return;
    const unsub = useDownloadStore.subscribe(() => {
      if (check()) unsub();
    });
  });
}

/** Ask for the phone folder (first time, or to change it). */
export async function choosePhoneFolder(): Promise<{ uri: string; name: string }> {
  const folder = await pickPhoneFolder();
  useDownloadStore.setState({ phoneFolder: folder });
  return folder;
}

const safeFileName = (track: Track) =>
  `${track.artist} - ${track.title}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) ||
  'song';

/**
 * Save a song as a normal audio file in the user's chosen folder (e.g. Music), so file
 * managers and other players see it. Downloads it first if needed. Returns "<folder>/<file>".
 */
export async function saveToPhone(track: Track): Promise<string> {
  if (!canDownload(track)) throw new Error('This song is already on your phone');
  const folder = useDownloadStore.getState().phoneFolder ?? (await choosePhoneFolder());
  downloadTrack(track);
  const fileUri = getDownloadedUri(track.id) ?? (await waitForDownload(track.id));
  try {
    const name = await copySongToFolder(fileUri, folder.uri, safeFileName(track));
    return `${folder.name}/${name}`;
  } catch (err) {
    // Permission lost or folder deleted: forget it so the next save asks again.
    useDownloadStore.setState({ phoneFolder: null });
    throw err;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function __resetDownloadsForTests(): void {
  running = false;
}
