/**
 * Permanent song files (app document dir, never auto-pruned like the media cache).
 * Thin wrapper over expo-file-system so download logic stays testable.
 */
import { Directory, File, Paths } from 'expo-file-system';

const FOLDER = 'downloads';

function dir(): Directory {
  const d = new Directory(Paths.document, FOLDER);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** Copy a file:// URI or download an http(s) URL into downloads/<name>. */
export async function saveSongFile(source: string, name: string): Promise<{ uri: string; bytes: number }> {
  const dest = new File(dir(), name);
  if (dest.exists) dest.delete();
  if (source.startsWith('file://')) {
    await new File(source).copy(dest);
  } else {
    await File.downloadFileAsync(source, dest, { idempotent: true });
  }
  const saved = new File(dir(), name);
  return { uri: saved.uri, bytes: saved.size ?? 0 };
}

export function deleteSongFile(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

export function songFileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

const MIME: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  webm: 'audio/webm',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

/** Ask the user for a folder on the phone (Android keeps the permission). */
export async function pickPhoneFolder(): Promise<{ uri: string; name: string }> {
  const d = await Directory.pickDirectoryAsync();
  return { uri: d.uri, name: d.name || 'Selected folder' };
}

/** Copy a downloaded song into a user-picked folder as "<name>.<ext>". Returns the file name used. */
export async function copySongToFolder(fileUri: string, folderUri: string, baseName: string): Promise<string> {
  const source = new File(fileUri);
  const ext = (source.name.split('.').pop() ?? 'mp3').toLowerCase();
  const folder = new Directory(folderUri);
  const taken = new Set(folder.list().map((e) => e.name));
  let name = `${baseName}.${ext}`;
  for (let n = 2; taken.has(name); n++) name = `${baseName} (${n}).${ext}`;
  const target = folder.createFile(name, MIME[ext] ?? 'audio/*');
  target.write(await source.bytes());
  return target.name || name;
}
