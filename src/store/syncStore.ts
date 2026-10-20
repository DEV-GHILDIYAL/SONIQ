import { appStorage } from '@/lib/appStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** One listen, as stored in the Supabase `plays` table. */
export interface PlayRow {
  user_id: string;
  track_id: string;
  title: string;
  artist: string;
  source: string;
  genre: string | null;
  duration_sec: number | null;
  /** Seconds actually listened. */
  listened_sec: number;
  played_at: string;
}

/** Keep at most this many unsent plays (oldest dropped) while offline. */
export const MAX_OUTBOX = 500;

interface SyncState {
  /** Plays not yet uploaded (persisted, so nothing is lost offline). */
  outbox: PlayRow[];
  /** Profile name last uploaded, to upsert only on change. */
  syncedName: string | null;
  /** Fingerprint of the last library backup uploaded (skip uploading the same thing again). */
  backupHash?: string | null;
}

export const useSyncStore = create<SyncState>()(
  persist((): SyncState => ({ outbox: [], syncedName: null }), {
    name: 'soniq:sync',
    storage: createJSONStorage(() => appStorage),
    version: 1,
  }),
);
