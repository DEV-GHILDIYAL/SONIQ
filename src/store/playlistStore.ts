import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Track } from '@/sources/types';

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  /** Set while the playlist is public: id of its community copy on the server. */
  publicId?: string;
  /** Fingerprint of what was last uploaded, so edits made offline still get pushed. */
  publicSynced?: string;
  /** Saved from someone's public playlist (shown as "from <name>"). */
  copiedFrom?: { id: string; owner: string };
}

interface PlaylistState {
  playlists: Playlist[];
  createPlaylist: (name: string) => Playlist;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  /** Append tracks (already-present ones are skipped). Returns how many were added. */
  addTracks: (id: string, tracks: Track[]) => number;
  removeTrack: (id: string, trackId: string) => void;
  moveTrack: (id: string, from: number, to: number) => void;
  /** Public / private bookkeeping (see src/lib/publicPlaylists.ts). */
  setPublic: (id: string, publicId: string | undefined, synced?: string) => void;
  /** New private playlist with these songs (e.g. saved from the community). */
  importPlaylist: (name: string, tracks: Track[], copiedFrom?: Playlist['copiedFrom']) => Playlist;
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Playlist name cannot be empty');
  return trimmed.slice(0, 60);
}

type SetState = (fn: (s: { playlists: Playlist[] }) => { playlists: Playlist[] }) => void;

function update(set: SetState, id: string, fn: (p: Playlist) => Playlist) {
  set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? fn(p) : p)) }));
}

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      playlists: [],
      createPlaylist: (name) => {
        const playlist: Playlist = {
          id: newId(),
          name: cleanName(name),
          tracks: [],
          createdAt: Date.now(),
        };
        set((s) => ({ playlists: [playlist, ...s.playlists] }));
        return playlist;
      },
      renamePlaylist: (id, name) => {
        const clean = cleanName(name);
        set((s) => ({
          playlists: s.playlists.map((p) => (p.id === id ? { ...p, name: clean } : p)),
        }));
      },
      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      addTracks: (id, tracks) => {
        const playlist = get().playlists.find((p) => p.id === id);
        if (!playlist) return 0;
        const known = new Set(playlist.tracks.map((t) => t.id));
        const fresh = tracks.filter((t) => !known.has(t.id));
        if (fresh.length > 0) update(set, id, (p) => ({ ...p, tracks: [...p.tracks, ...fresh] }));
        return fresh.length;
      },
      removeTrack: (id, trackId) =>
        update(set, id, (p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== trackId) })),
      moveTrack: (id, from, to) =>
        update(set, id, (p) => {
          if (from === to || from < 0 || to < 0 || from >= p.tracks.length || to >= p.tracks.length)
            return p;
          const tracks = [...p.tracks];
          const [item] = tracks.splice(from, 1);
          if (item) tracks.splice(to, 0, item);
          return { ...p, tracks };
        }),
      setPublic: (id, publicId, synced) =>
        update(set, id, (p) => ({ ...p, publicId, publicSynced: publicId ? synced : undefined })),
      importPlaylist: (name, tracks, copiedFrom) => {
        const playlist: Playlist = {
          id: newId(),
          name: cleanName(name),
          tracks: [...tracks],
          createdAt: Date.now(),
          copiedFrom,
        };
        set((s) => ({ playlists: [playlist, ...s.playlists] }));
        return playlist;
      },
    }),
    {
      name: 'soniq:playlists',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ playlists: s.playlists }),
      version: 1,
    },
  ),
);
