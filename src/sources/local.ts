/**
 * Local files: picked with expo-document-picker, copied into the app's document
 * directory (so they survive cache clears), listed in useLocalLibraryStore.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { TrackUnavailableError } from '@/lib/errors';
import { useLocalLibraryStore, type LocalFile } from '@/store/localLibraryStore';
import type { MusicSource, Track } from './types';

const MUSIC_DIR = 'music';

/** "01 - My_Song (final).mp3" -> "01 - My Song (final)" */
export function titleFromFileName(name: string): string {
  return (
    name
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[_]+/g, ' ')
      .trim() || 'Untitled'
  );
}

function safeName(name: string): string {
  return name.replace(/[^\w.\- ()]+/g, '_');
}

export function localFileToTrack(f: LocalFile): Track {
  return {
    id: `local:${f.id}`,
    title: f.title,
    artist: 'Unknown artist',
    durationSec: 0,
    source: 'local',
  };
}

export function localTracks(): Track[] {
  return useLocalLibraryStore.getState().files.map(localFileToTrack);
}

/**
 * Open the system picker and import the chosen audio files.
 * Resolves to the number of files imported (0 when the user cancels).
 */
export async function importLocalFiles(): Promise<number> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return 0;

  const dir = new Directory(Paths.document, MUSIC_DIR);
  dir.create({ intermediates: true, idempotent: true });

  const imported: LocalFile[] = [];
  for (const asset of result.assets) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const target = new File(dir, `${id}-${safeName(asset.name)}`);
    await new File(asset.uri).copy(target);
    imported.push({
      id,
      title: titleFromFileName(asset.name),
      uri: target.uri,
      addedAt: Date.now(),
    });
  }
  useLocalLibraryStore.getState().addFiles(imported);
  return imported.length;
}

/**
 * Remove an imported song from SONIQ and delete SONIQ's own copy of it.
 * The original file on the phone (picked from the file manager) is not touched.
 */
export function removeLocalFile(trackId: string): void {
  const id = trackId.replace(/^local:/, '');
  const file = useLocalLibraryStore.getState().files.find((f) => f.id === id);
  if (!file) return;
  try {
    const copy = new File(file.uri);
    if (copy.exists) copy.delete();
  } catch {
    // already gone
  }
  useLocalLibraryStore.getState().removeFile(id);
}

export const localSource: MusicSource = {
  id: 'local',
  label: 'On this device',

  async search(query, limit = 20) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return localTracks()
      .filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, limit);
  },

  async getStreamUrl(track) {
    const id = track.id.replace(/^local:/, '');
    const file = useLocalLibraryStore.getState().files.find((f) => f.id === id);
    if (!file) throw new TrackUnavailableError('This file was removed from your library');
    if (!new File(file.uri).exists)
      throw new TrackUnavailableError('File not found on this device');
    return file.uri;
  },
};
