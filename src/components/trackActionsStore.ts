import { create } from 'zustand';
import type { Track } from '@/sources/types';

interface TrackActionsState {
  track: Track | null;
  /** Set when opened from a playlist page (enables "Remove from this playlist"). */
  playlistId?: string;
  open: (track: Track, ctx?: { playlistId?: string }) => void;
  close: () => void;
}

/** UI-only state for the single TrackActionsSheet mounted in the root layout. */
export const useTrackActionsStore = create<TrackActionsState>()((set) => ({
  track: null,
  open: (track, ctx) => set({ track, playlistId: ctx?.playlistId }),
  close: () => set({ track: null, playlistId: undefined }),
}));

export const openTrackActions = (track: Track, ctx?: { playlistId?: string }) =>
  useTrackActionsStore.getState().open(track, ctx);
