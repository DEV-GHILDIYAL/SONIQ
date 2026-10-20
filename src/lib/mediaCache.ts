/**
 * Downloads remote media into the app cache with explicit byte ranges and returns a
 * file:// URI for the player. Used for Save to phone and as the player's fallback when
 * a direct stream is refused. (The patched native player also sends `Range: bytes=0-`
 * on its first request, because YouTube throttles un-ranged GETs.)
 */
import { Directory, File, FileMode, Paths } from 'expo-file-system';

/** Default bytes per request. YouTube rejects large single ranges (4 MB got HTTP 403). */
const DEFAULT_CHUNK_BYTES = 1024 * 1024;
/** Chunks fetched at the same time; they are written to the file in order. */
const PARALLEL_CHUNKS = 3;
/** Max cached files per folder; oldest are deleted first. */
const MAX_FILES = 40;
/** Hard cap for one cache folder (oldest files go first). */
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
/** Never delete a file this fresh: it may be the song that is playing right now. */
const FRESH_MS = 10 * 60_000;
/** Leftover chunks of an interrupted download are removed after this. */
const STALE_TEMP_MS = 60 * 60_000;

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

const isTemp = (name: string) => /\.(part|chunk)(\d+)?$/.test(name);

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
        !isTemp(e.name) &&
        (e.size ?? 0) > 0,
    );
  return hit?.uri ?? null;
}

/**
 * Keep a folder under the size/file cap. Oldest files are deleted first, but files from
 * the last FRESH_MS are protected (they may belong to the current playback).
 */
function prune(dir: Directory, incomingBytes = 0): void {
  const all = dir.list().filter((e): e is File => e instanceof File);
  const now = Date.now();

  for (const f of all) {
    if (isTemp(f.name) && now - (f.modificationTime ?? 0) > STALE_TEMP_MS) {
      try {
        f.delete();
      } catch {
        // best effort
      }
    }
  }

  const files = all
    .filter((f) => !isTemp(f.name))
    .sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
  let total = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  let count = files.length;
  for (const f of files) {
    if (count < MAX_FILES && total + incomingBytes <= MAX_TOTAL_BYTES) break;
    if (now - (f.modificationTime ?? 0) < FRESH_MS) continue;
    try {
      total -= f.size ?? 0;
      count -= 1;
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

/** Delete every temporary file of this download, whatever stage it reached. */
function clearParts(dir: Directory, fileName: string): void {
  for (const e of dir.list()) {
    if (e instanceof File && e.name.startsWith(`${fileName}.part`)) {
      try {
        e.delete();
      } catch {
        // ignore
      }
    }
    if (e instanceof File && e.name.startsWith(`${fileName}.chunk`)) {
      try {
        e.delete();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Download `totalBytes` with `PARALLEL_CHUNKS` range requests into separate temp files,
 * then write them into `part` in order. Peak extra disk use: chunk size x parallelism.
 */
async function downloadChunked(
  url: string,
  dir: Directory,
  part: File,
  fileName: string,
  totalBytes: number,
  headers: Record<string, string>,
  chunkBytes: number,
): Promise<void> {
  const chunks = Math.ceil(totalBytes / chunkBytes);
  const files: File[] = new Array(chunks);
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= chunks) return;
      const from = i * chunkBytes;
      const to = Math.min(from + chunkBytes, totalBytes) - 1;
      const chunk = new File(dir, `${fileName}.chunk${i}`);
      await downloadRange(url, chunk, headers, from, to);
      files[i] = chunk;
    }
  };

  const results = await Promise.allSettled(
    Array.from({ length: Math.min(PARALLEL_CHUNKS, chunks) }, () => worker()),
  );
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;

  if (part.exists) part.delete();
  part.create();
  const handle = part.open(FileMode.ReadWrite);
  try {
    for (let i = 0; i < files.length; i++) {
      const chunk = files[i];
      if (!chunk) throw new MediaDownloadError(`missing chunk ${i}`);
      handle.offset = i * chunkBytes;
      handle.writeBytesSync(await chunk.bytes());
    }
  } finally {
    handle.close();
    // Chunks are only needed until they are written into the final file.
    for (const chunk of files) {
      try {
        if (chunk?.exists) chunk.delete();
      } catch {
        // best effort
      }
    }
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
  prune(dir, totalBytes ?? 0);
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
    } else if (totalBytes && totalBytes > chunkBytes) {
      await downloadChunked(url, dir, part, fileName, totalBytes, headers, chunkBytes);
    } else {
      await downloadRange(url, part, headers, 0, totalBytes ? totalBytes - 1 : undefined);
    }

    const size = part.size ?? 0;
    if (size === 0 || (totalBytes && size !== totalBytes)) {
      throw new MediaDownloadError(`incomplete download (${size}/${totalBytes ?? '?'} bytes)`);
    }
    part.rename(fileName);
    return new File(dir, fileName).uri;
  } catch (err) {
    clearParts(dir, fileName);
    throw err instanceof MediaDownloadError ? err : toDownloadError(err);
  }
}
