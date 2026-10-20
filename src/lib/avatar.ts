/**
 * Profile picture: picked with the system file picker (no extra native module) and copied
 * into the app's document folder so it survives cache clears. The same image is uploaded
 * to Supabase Storage, so account restore can bring it back on a new install.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { getSupabase, supabaseConfigured } from './supabase';

const DIR = 'profile';
/** Public bucket created by supabase/setup.sql. */
const AVATAR_BUCKET = 'avatars';

const IMAGE_EXT = /^(jpe?g|png|webp|gif|heic|heif|bmp)$/;

function dir(): Directory {
  const d = new Directory(Paths.document, DIR);
  d.create({ intermediates: true, idempotent: true });
  return d;
}

/** Keep a sensible image extension; fall back to jpg. */
function extensionOf(name: string): string {
  const raw = (name.split('.').pop() ?? '').toLowerCase();
  if (!IMAGE_EXT.test(raw)) return 'jpg';
  return raw === 'jpeg' ? 'jpg' : raw;
}

function contentTypeOf(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
    case 'heif':
      return 'image/heic';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg';
  }
}

/** Let the user pick an image; returns its new file:// URI, or null if cancelled. */
export async function pickAvatar(previous?: string | null): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    multiple: false,
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const ext = extensionOf(asset.name ?? '');
  // New name each time so the Image component doesn't show a cached old picture.
  const target = new File(dir(), `avatar-${Date.now()}.${ext}`);
  await new File(asset.uri).copy(target);
  if (!target.exists || (target.size ?? 0) === 0) {
    throw new Error('The selected image could not be copied. Try another photo.');
  }
  deleteAvatar(previous);
  return target.uri;
}

/** Upload the local photo to Supabase Storage and return its public URL. */
export async function uploadAvatar(profileId: string, uri: string): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  try {
    const file = new File(uri);
    if (!file.exists || (file.size ?? 0) === 0) return null;
    const ext = extensionOf(file.name);
    // A stable path means a new photo replaces the old one instead of filling the bucket.
    const path = `${profileId}/avatar.${ext}`;
    const body = new Uint8Array(await file.bytes()).buffer;
    const { error } = await getSupabase()
      .storage.from(AVATAR_BUCKET)
      .upload(path, body, { contentType: contentTypeOf(ext), upsert: true });
    if (error) throw error;
    const { data } = getSupabase().storage.from(AVATAR_BUCKET).getPublicUrl(path);
    // Version the URL so Image doesn't show the previous photo from its cache.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (err) {
    console.warn('[avatar] cloud upload failed:', err);
    return null;
  }
}

/** Download a backed-up photo into the app folder (offline-friendly after a restore). */
export async function fetchAvatar(url: string): Promise<string | null> {
  try {
    const match = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(url);
    const ext = match ? extensionOf(`x.${match[1]}`) : 'jpg';
    const target = new File(dir(), `avatar-restored-${Date.now()}.${ext}`);
    const downloaded = await File.downloadFileAsync(url, target, { idempotent: true });
    return downloaded.exists && (downloaded.size ?? 0) > 0 ? downloaded.uri : null;
  } catch (err) {
    console.warn('[avatar] could not cache the restored photo:', err);
    return null;
  }
}

export function deleteAvatar(uri?: string | null): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // already gone or a remote URL
  }
}
