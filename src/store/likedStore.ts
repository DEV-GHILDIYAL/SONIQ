import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Track } from '@/sources/types';

interface LikedState {
  /** Newest first. */
  tracks: Track[];
  /** Like or unlike; returns true when the track is now liked. */
  toggle: (track: Track) => boolean;
  remove: (trackId: string) => void;
}

/** "Liked Songs": an automatic playlist filled by the ❤️ button. */
export const useLikedStore = create<LikedState>()(
  persist(
    (set, get) => ({
      tracks: [],
      toggle: (track) => {
        const liked = get().tracks.some((t) => t.id === track.id);
        set((s) => ({
          tracks: liked ? s.tracks.filter((t) => t.id !== track.id) : [track, ...s.tracks],
        }));
        return !liked;
      },
      remove: (trackId) => set((s) => ({ tracks: s.tracks.filter((t) => t.id !== trackId) })),
    }),
    {
      name: 'soniq:liked',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ tracks: s.tracks }),
      version: 1,
    },
  ),
);

/** Re-renders only when this track's liked state changes. */
export const useIsLiked = (trackId: string | undefined) =>
  useLikedStore((s) => !!trackId && s.tracks.some((t) => t.id === trackId));
