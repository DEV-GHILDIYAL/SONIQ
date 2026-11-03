/**
 * Tiny key → bytes cache. Matches youtubei.js's ICache interface so its player script
 * and session data survive app restarts.
 *
 * Native (Android/iOS): uses expo-file-system (app document directory).
 * Web (Tauri desktop / browser): falls back to localStorage (base64-encoded).
 */
import { Platform } from 'react-native';

// ---- Web fallback (localStorage) ----

class WebKvCache {
  private readonly prefix: string;
  readonly cache_dir: string;

  constructor(folderName: string) {
    this.prefix = `soniq-kv-${folderName}:`;
    this.cache_dir = `localStorage://${folderName}`;
  }

  async get(key: string): Promise<ArrayBuffer | undefined> {
    try {
      const b64 = localStorage.getItem(this.prefix + key);
      if (!b64) return undefined;
      const binary = atob(b64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      return buf.buffer;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: ArrayBuffer): Promise<void> {
    try {
      const bytes = new Uint8Array(value);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
      localStorage.setItem(this.prefix + key, btoa(binary));
    } catch {
      // localStorage full or unavailable — best effort
    }
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch {
      // ignore
    }
  }

  clear(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(this.prefix)) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}

// ---- Native (expo-file-system) ----

const safeName = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, '_');

class NativeKvCache {
  readonly cache_dir: string;
  private dir: import('expo-file-system').Directory;

  constructor(folderName: string) {
    // Lazy import keeps web bundles from pulling in expo-file-system.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Directory: Dir, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    this.dir = new Dir(Paths.document, folderName);
    this.cache_dir = this.dir.uri;
  }

  private file(key: string): import('expo-file-system').File {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File: F } = require('expo-file-system') as typeof import('expo-file-system');
    if (!this.dir.exists) this.dir.create({ intermediates: true, idempotent: true });
    return new F(this.dir, safeName(key));
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

  clear(): void {
    try {
      if (this.dir.exists) this.dir.delete();
    } catch {
      // ignore
    }
  }
}

// ---- Public export ----

/** Isomorphic key→bytes cache (disk on native, localStorage on web). */
export type FileKvCache = WebKvCache | NativeKvCache;

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const FileKvCache: new (folderName: string) => FileKvCache =
  Platform.OS === 'web' ? WebKvCache : NativeKvCache;
