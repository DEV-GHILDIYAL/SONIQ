import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** A music file copied into the app's document directory. */
export interface LocalFile {
  /** Stable id (also the Track id suffix). */
  id: string;
  title: string;
  /** file:// URI inside the app's document directory. */
  uri: string;
  addedAt: number;
}

interface LocalLibraryState {
  files: LocalFile[];
  addFiles: (files: LocalFile[]) => void;
  removeFile: (id: string) => void;
}

/** List of imported local files. Written by the local source adapter only. */
export const useLocalLibraryStore = create<LocalLibraryState>()(
  persist(
    (set) => ({
      files: [],
      addFiles: (files) =>
        set((s) => {
          const known = new Set(s.files.map((f) => f.id));
          return { files: [...files.filter((f) => !known.has(f.id)), ...s.files] };
        }),
      removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
    }),
    {
      name: 'soniq:local-library',
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({ files: s.files }),
      version: 1,
    },
  ),
);
