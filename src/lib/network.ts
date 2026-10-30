/**
 * Online / offline state for the whole app (banner, greyed songs, player skipping).
 * Started once from the root layout.
 */
import { create } from 'zustand';
import type { Track } from '@/sources/types';
import { useDownloadStore } from '@/store/downloadStore';

interface NetworkStore {
  offline: boolean;
  /** When the connection last came back (for a short "Back online" note). */
  backAt: number | null;
}

export const useNetworkStore = create<NetworkStore>()(() => ({ offline: false, backAt: null }));

export const isOffline = (): boolean => useNetworkStore.getState().offline;

function setOffline(offline: boolean): void {
  const prev = useNetworkStore.getState().offline;
  if (prev === offline) return;
  useNetworkStore.setState({ offline, backAt: offline ? null : Date.now() });
}

function offlineFrom(state: { isConnected?: boolean; isInternetReachable?: boolean }): boolean {
  // Unknown (undefined) counts as online so a slow first check never blocks playback.
  return state.isConnected === false || state.isInternetReachable === false;
}

let started = false;

export function startNetworkWatch(): void {
  if (started) return;
  started = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Network = require('expo-network') as typeof import('expo-network');
    void Network.getNetworkStateAsync()
      .then((s) => setOffline(offlineFrom(s)))
      .catch(() => {});
    Network.addNetworkStateListener((s) => setOffline(offlineFrom(s)));
  } catch {
    // Native module missing (tests / old build): assume online.
  }
}

/** True when this song plays without internet (phone file or downloaded). */
export function isPlayableOffline(track: Track): boolean {
  return track.source === 'local' || !!useDownloadStore.getState().items[track.id];
}

/** Hook: should this row look disabled right now? */
export function useUnplayableOffline(track: Track): boolean {
  const offline = useNetworkStore((s) => s.offline);
  const downloaded = useDownloadStore((s) => !!s.items[track.id]);
  return offline && track.source !== 'local' && !downloaded;
}
