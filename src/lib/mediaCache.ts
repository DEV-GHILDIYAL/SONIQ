/**
 * Downloads remote media into the app cache with explicit byte ranges and returns a
 * file:// URI for the player. Used when a host rejects the player's own requests
 * (YouTube answers ExoPlayer's un-ranged GET with 403 but serves Range requests).
 */
import { Directory, File, FileMode, Paths } from 'expo-file-system';

/** Default bytes per request. YouTube rejects large single ranges (4 MB got HTTP 403). */
const DEFAULT_CHUNK_BYTES = 1024 * 1024;
/** Max cached files per folder; oldest are deleted first. */
const MAX_FILES = 40;

export class MediaDownloadError extends Error {
  constructor(
    message: string,
    /** HTTP status if the server answered with an error, otherwise undefined (network). */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MediaDownloadError';
  }
}

function folder(name: string): Directory {
  const dir = new Directory(Paths.cache, name);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** URI of a fully downloaded file named `<key>.<ext>` in `folderName`, or null. */
export function getCachedMedia(folderName: string, key: string): string | null {
  const dir = new Directory(Paths.cache, folderName);
  if (!dir.exists) return null;
  const hit = dir
    .list()
    .find(
      (e): e is File =>
        e instanceof File &&
        e.name.startsWith(`${key}.`) &&
        !e.name.endsWith('.part') &&
        (e.size ?? 0) > 0,
    );
  return hit?.uri ?? null;
}

function prune(dir: Directory): void {
  const files = dir
    .list()
    .filter((e): e is File => e instanceof File)
    .sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
  for (const f of files.slice(0, Math.max(0, files.length - MAX_FILES + 1))) {
    try {
      f.delete();
    } catch {
      // best effort
    }
  }
}

function toDownloadError(err: unknown): MediaDownloadError {
  const message = err instanceof Error ? err.message : String(err);
  const code = /\b([45]\d\d)\b/.exec(message)?.[1];
  return new MediaDownloadError(message, code ? Number(code) : undefined);
}

export interface DownloadMediaOptions {
  /** Extra request headers (e.g. a User-Agent the host expects). */
  headers?: Record<string, string>;
  /** Bytes per Range request. */
  chunkBytes?: number;
  /**
   * Custom chunk fetcher (inclusive byte range). When set it replaces the default
   * Range-header GET, e.g. for hosts that want the range in the URL.
   */
  fetchChunk?: (from: number, to: number) => Promise<Uint8Array>;
}

async function downloadRange(
  url: string,
  dest: File,
  headers: Record<string, string>,
  from: number,
  to?: number,
): Promise<void> {
  if (dest.exists) dest.delete();
  try {
    await File.downloadFileAsync(url, dest, {
      headers: { ...headers, Range: `bytes=${from}-${to ?? ''}` },
      idempotent: true,
    });
  } catch (err) {
    throw toDownloadError(err);
  }
}

/**
 * Download `url` to `<cache>/<folderName>/<fileName>` using Range requests.
 * `totalBytes` (if known) enables chunking and a completeness check.
 */
export async function downloadMedia(
  url: string,
  folderName: string,
  fileName: string,
  totalBytes?: number,
  options: DownloadMediaOptions = {},
): Promise<string> {
  const headers = options.headers ?? {};
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const dir = folder(folderName);
  prune(dir);
  const target = new File(dir, fileName);
  const part = new File(dir, `${fileName}.part`);
  if (target.exists) target.delete();

  try {
    if (options.fetchChunk && totalBytes) {
      if (part.exists) part.delete();
      part.create();
      const handle = part.open(FileMode.ReadWrite);
      try {
        for (let from = 0; from < totalBytes; from += chunkBytes) {
          const to = Math.min(from + chunkBytes, totalBytes) - 1;
          handle.writeBytesSync(await options.fetchChunk(from, to));
        }
      } finally {
        handle.close();
      }
    } else if (!totalBytes || totalBytes <= chunkBytes) {
      await downloadRange(url, part, headers, 0, totalBytes ? totalBytes - 1 : undefined);
    } else {
      if (part.exists) part.delete();
      part.create();
      const chunk = new File(dir, `${fileName}.chunk`);
      const handle = part.open(FileMode.ReadWrite);
      try {
        for (let from = 0; from < totalBytes; from += chunkBytes) {
          const to = Math.min(from + chunkBytes, totalBytes) - 1;
          await downloadRange(url, chunk, headers, from, to);
          handle.writeBytesSync(await chunk.bytes());
        }
      } finally {
        handle.close();
        if (chunk.exists) chunk.delete();
      }
    }

    const size = part.size ?? 0;
    if (size === 0 || (totalBytes && size !== totalBytes)) {
      throw new MediaDownloadError(`incomplete download (${size}/${totalBytes ?? '?'} bytes)`);
    }
    part.rename(fileName);
    return new File(dir, fileName).uri;
  } catch (err) {
    if (part.exists) part.delete();
    throw err instanceof MediaDownloadError ? err : toDownloadError(err);
  }
}
