/**
 * Profile picture: picked with the system file picker (no extra native module),
 * copied into the app's document folder so it survives cache clears. Stays on the phone.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

const DIR = 'profile';

/** Let the user pick an image; returns its new file:// URI, or null if cancelled. */
export async function pickAvatar(previous?: string | null): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    multiple: false,
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const dir = new Directory(Paths.document, DIR);
  dir.create({ intermediates: true, idempotent: true });
  const ext = (asset.name.split('.').pop() ?? 'jpg').toLowerCase().slice(0, 5);
  // New name each time so the Image component doesn't show a cached old picture.
  const target = new File(dir, `avatar-${Date.now()}.${ext}`);
  await new File(asset.uri).copy(target);
  deleteAvatar(previous);
  return target.uri;
}

export function deleteAvatar(uri?: string | null): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}
