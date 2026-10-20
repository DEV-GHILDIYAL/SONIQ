import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Track } from '@/sources/types';

export interface DownloadedSong {
  track: Track;
  uri: string;
  bytes: number;
  at: number;
}

interface DownloadState {
  /** Finished downloads by track id (persisted). */
  items: Record<string, DownloadedSong>;
  /** Waiting + running, in order (not persisted). */
  pending: Track[];
  /** Track id being downloaded right now. */
  active: string | null;
  /** Last error per track id. */
  failed: Record<string, string>;
  /** Folder picked for "Save to phone" (persisted). */
  phoneFolder: { uri: string; name: string } | null;
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (): DownloadState => ({ items: {}, pending: [], active: null, failed: {}, phoneFolder: null }),
    {
      name: 'soniq:downloads',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ items: s.items, phoneFolder: s.phoneFolder }),
      version: 1,
    },
  ),
);

export type DownloadStatus = 'none' | 'queued' | 'downloading' | 'done' | 'failed';

export const useDownloadStatus = (trackId: string | undefined): DownloadStatus =>
  useDownloadStore((s) => {
    if (!trackId) return 'none';
    if (s.items[trackId]) return 'done';
    if (s.active === trackId) return 'downloading';
    if (s.pending.some((t) => t.id === trackId)) return 'queued';
    if (s.failed[trackId]) return 'failed';
    return 'none';
  });
