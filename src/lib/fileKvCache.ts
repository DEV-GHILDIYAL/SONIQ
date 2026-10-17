/**
 * Tiny key -> bytes cache on disk (app document dir). Matches youtubei.js's ICache,
 * so its player script and session data survive app restarts.
 */
import { Directory, File, Paths } from 'expo-file-system';

const safeName = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, '_');

export class FileKvCache {
  readonly cache_dir: string;
  private readonly dir: Directory;

  constructor(folderName: string) {
    this.dir = new Directory(Paths.document, folderName);
    this.cache_dir = this.dir.uri;
  }

  private file(key: string): File {
    if (!this.dir.exists) this.dir.create({ intermediates: true, idempotent: true });
    return new File(this.dir, safeName(key));
  }

  async get(key: string): Promise<ArrayBuffer | undefined> {
    try {
      const f = this.file(key);
      if (!f.exists) return undefined;
      const bytes = await f.bytes();
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: ArrayBuffer): Promise<void> {
    try {
      await this.file(key).write(new Uint8Array(value));
    } catch {
      // Cache is best effort.
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const f = this.file(key);
      if (f.exists) f.delete();
    } catch {
      // ignore
    }
  }

  /** Delete everything (e.g. after a YouTube change broke the cached player). */
  clear(): void {
    try {
      if (this.dir.exists) this.dir.delete();
    } catch {
      // ignore
    }
  }
}
