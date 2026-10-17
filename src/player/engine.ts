/**
 * Playback engine. The ONLY module in the app that talks to expo-audio.
 * UI calls these functions and reads state from usePlayerStore.
 */
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { isTrackUnavailable } from '@/lib/errors';
import type { Track } from '@/sources/types';
import { usePlayerStore, type PlayerState } from '@/store/playerStore';
import { useProfileStore } from '@/store/profileStore';
import { useRecentStore } from '@/store/recentStore';
import { useUnavailableStore } from '@/store/unavailableStore';
import {
  cancelSleepTimer,
  setSleepDueHandler,
  sleepActive,
  sleepDecision,
  sleepDue,
  useSleepStore,
} from './sleep';
import {
  addToQueue as queueAdd,
  clearUpcoming,
  createQueue,
  currentTrack,
  moveTrack,
  nextPosition,
  playNext as queuePlayNext,
  prevPosition,
  removeAt,
  selectTrack,
  shuffleQueue,
  unshuffleQueue,
  type QueueState,
  type RepeatMode,
} from './queue';

/** Resolves a playable URL for a track (wired to the source registry at app start). */
export type StreamResolver = (track: Track) => Promise<string>;

/** Warms up the next track while the current one plays (wired to the registry at app start). */
export type Prefetcher = (track: Track) => Promise<void>;

/** prev() restarts the current track instead of going back when past this point. */
const RESTART_THRESHOLD_SEC = 3;

let player: AudioPlayer | null = null;
let resolveStreamUrl: StreamResolver | null = null;
let prefetcher: Prefetcher | null = null;
/** Incremented on every load; a stale async load must not override a newer one. */
let loadToken = 0;
let lockScreenActive = false;

const state = () => usePlayerStore.getState();

function setState(partial: Partial<PlayerState>): void {
  usePlayerStore.setState(partial);
}

function onStatus(status: AudioStatus): void {
  const { status: current } = state();
  const patch: Partial<PlayerState> = { positionSec: status.currentTime };
  if (status.duration > 0) patch.durationSec = status.duration;
  // Native player failed (bad URL, HTTP 403, unsupported codec...). Without this the UI
  // would sit on "playing" with no sound.
  if (status.error && (current === 'playing' || current === 'loading')) {
    const track = currentTrack(state().queue);
    console.warn(`[player] playback error${track ? ` (${track.id})` : ''}: ${status.error}`);
    setState({ ...patch, status: 'error', error: `Playback failed: ${status.error}` });
    return;
  }
  // Keep UI in sync when playback is toggled from the lock screen / notification.
  if (status.isLoaded && !status.didJustFinish) {
    if (status.playing && current === 'paused') patch.status = 'playing';
    if (!status.playing && !status.isBuffering && current === 'playing') patch.status = 'paused';
  }
  setState(patch);
  if (status.didJustFinish) {
    void advance(true);
    return;
  }
  applySleep(status.currentTime, status.duration);
}

/** Fade out / stop for the sleep timer. Runs on every status tick while playing. */
function applySleep(positionSec: number, durationSec: number): void {
  const sleep = useSleepStore.getState();
  if (!player || !sleepActive(sleep) || state().status !== 'playing') return;
  const now = Date.now();
  const remaining = durationSec > 0 ? Math.max(0, durationSec - positionSec) : Number.POSITIVE_INFINITY;
  const d = sleepDecision(sleep, now, remaining);
  if (d.startFade) useSleepStore.setState({ fadeStartedAt: now });
  if (d.stopNow) {
    stopForSleep();
    return;
  }
  player.volume = d.volume;
}

/** Sleep timer done: pause, restore volume, clear the timer. */
function stopForSleep(): void {
  player?.pause();
  if (player) player.volume = 1;
  cancelSleepTimer();
  setState({ status: 'paused' });
}

// Timer due while nothing is playing: just turn it off.
setSleepDueHandler(() => {
  if (state().status !== 'playing') cancelSleepTimer();
});

/** Turn the sleep timer off and restore full volume. */
export function turnOffSleepTimer(): void {
  cancelSleepTimer();
  if (player) player.volume = 1;
}

function getPlayer(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(null);
    player.addListener('playbackStatusUpdate', onStatus);
    // Next / Previous on the notification + lock screen (needs scripts/patch-expo-audio.js).
    const remote = player as unknown as {
      addListener: (event: string, cb: () => void) => { remove: () => void };
    };
    remote.addListener('lockScreenNext', () => void next());
    remote.addListener('lockScreenPrevious', () => void prev());
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  }
  return player;
}

function updateLockScreen(p: AudioPlayer, track: Track): void {
  const metadata = {
    title: track.title,
    artist: track.artist,
    albumTitle: track.album,
    artworkUrl: track.artworkUrl,
  };
  try {
    if (!lockScreenActive) {
      p.setActiveForLockScreen(true, metadata, {
        showSeekForward: true,
        showSeekBackward: true,
        showNextTrack: true,
        showPreviousTrack: true,
      });
      lockScreenActive = true;
    } else {
      p.updateLockScreenMetadata(metadata);
    }
  } catch {
    // Lock-screen controls are best effort; playback must not fail because of them.
  }
}

/** Inject the prefetcher (e.g. registry.prefetch). Optional. */
export function setPrefetcher(fn: Prefetcher | null): void {
  prefetcher = fn;
}

/** Start warming up the track that will play after the current one. */
function prefetchNext(queue: QueueState): void {
  if (!prefetcher) return;
  const pos = nextPosition(queue, state().repeat, true);
  const next = pos !== null && pos !== queue.index ? queue.tracks[pos] : undefined;
  if (next) void prefetcher(next).catch(() => {});
}

/** Inject the URL resolver (e.g. registry.getStreamUrl). Must be called before play(). */
export function setStreamResolver(resolver: StreamResolver): void {
  resolveStreamUrl = resolver;
}

/**
 * Load and start the current track of `queue`.
 * `skipsLeft` bounds auto-skipping over unavailable tracks (never loops forever).
 */
async function loadAndPlay(queue: QueueState, skipsLeft = queue.tracks.length - 1): Promise<void> {
  const track = currentTrack(queue);
  if (!track) return;
  if (!resolveStreamUrl)
    throw new Error('Stream resolver not set. Call setStreamResolver() first.');

  const token = ++loadToken;
  setState({
    queue,
    status: 'loading',
    positionSec: 0,
    durationSec: track.durationSec,
    error: null,
  });
  try {
    const uri = await resolveStreamUrl(track);
    if (token !== loadToken) return;
    const p = getPlayer();
    p.replace({ uri });
    p.play();
    setState({ status: 'playing' });
    updateLockScreen(p, track);
    useRecentStore.getState().add(track);
    useProfileStore.getState().recordPlay(track);
    prefetchNext(queue);
  } catch (err) {
    if (token !== loadToken) return;
    setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    // Only permanently unavailable tracks are hidden and skipped. Network errors stay
    // visible (and keep the error on screen) so going offline never hides songs.
    if (!isTrackUnavailable(err)) return;
    useUnavailableStore.getState().mark(track.id);
    const pos = nextPosition(queue, state().repeat, false);
    if (skipsLeft > 0 && pos !== null && pos !== queue.index) {
      await loadAndPlay({ ...queue, index: pos }, skipsLeft - 1);
    }
  }
}

/** New queue, shuffled (start track first) when shuffle is on. */
function startQueue(tracks: readonly Track[], startIndex: number): Promise<void> {
  const queue = createQueue(tracks, startIndex);
  if (state().shuffle && queue.tracks.length > 1) {
    setState({ unshuffled: queue.tracks });
    return loadAndPlay(shuffleQueue(queue));
  }
  setState({ unshuffled: null });
  return loadAndPlay(queue);
}

/** Play a track. Jumps to it if it is already queued, otherwise starts a new queue with it. */
export function play(track: Track): Promise<void> {
  const queue = state().queue;
  if (queue.tracks.some((t) => t.id === track.id)) return loadAndPlay(selectTrack(queue, track));
  return startQueue([track], 0);
}

/** Replace the queue with `tracks` and start at `startIndex`. */
export function playQueue(tracks: readonly Track[], startIndex = 0): Promise<void> {
  return startQueue(tracks, startIndex);
}

/** Jump to a position in the current queue. */
export function jumpTo(index: number): Promise<void> {
  const { queue } = state();
  if (index < 0 || index >= queue.tracks.length) return Promise.resolve();
  return loadAndPlay({ ...queue, index });
}

export function pause(): void {
  if (!player) return;
  player.pause();
  setState({ status: 'paused' });
}

export function resume(): void {
  if (!player || state().status !== 'paused') return;
  player.play();
  setState({ status: 'playing' });
}

export async function seek(sec: number): Promise<void> {
  if (!player) return;
  const target = Math.max(0, sec);
  await player.seekTo(target);
  setState({ positionSec: target });
}

/** Jump forward/back by `deltaSec` (e.g. ±30), clamped to the track. */
export async function seekBy(deltaSec: number): Promise<void> {
  const { positionSec, durationSec } = state();
  const end = durationSec > 0 ? Math.max(0, durationSec - 1) : Number.POSITIVE_INFINITY;
  await seek(Math.min(end, Math.max(0, positionSec + deltaSec)));
}

async function advance(auto: boolean): Promise<void> {
  // Sleep timer due: the song ended, so stop here instead of playing the next one.
  if (auto && sleepDue(useSleepStore.getState(), Date.now())) {
    stopForSleep();
    return;
  }
  const { queue, repeat } = state();
  const pos = nextPosition(queue, repeat, auto);
  if (pos === null) {
    player?.pause();
    setState({ status: 'idle', positionSec: 0 });
    return;
  }
  if (auto && pos === queue.index && player) {
    // Repeat one: replay without re-resolving the stream.
    await player.seekTo(0);
    player.play();
    setState({ status: 'playing', positionSec: 0 });
    return;
  }
  await loadAndPlay({ ...queue, index: pos });
}

/** Go to the next track (repeat-all wraps around; otherwise stops at the end). */
export function next(): Promise<void> {
  return advance(false);
}

/** Restart the current track if past a few seconds, otherwise go to the previous one. */
export async function prev(): Promise<void> {
  const { queue, repeat } = state();
  if (!player) return;
  const pos = prevPosition(queue, repeat);
  if (player.currentTime > RESTART_THRESHOLD_SEC || pos === null) {
    await seek(0);
    return;
  }
  await loadAndPlay({ ...queue, index: pos });
}

// ---- Queue editing (no reload of the current track) ----

/** Play these tracks right after the current one. Starts playback if nothing is queued. */
export function playNext(tracks: Track[]): Promise<void> {
  const { queue } = state();
  if (queue.index < 0) return startQueue(tracks, 0);
  setState({ queue: queuePlayNext(queue, ...tracks) });
  return Promise.resolve();
}

/** Append tracks to the end of the queue. Starts playback if nothing is queued. */
export function addToQueue(tracks: Track[]): Promise<void> {
  const { queue } = state();
  if (queue.index < 0) return startQueue(tracks, 0);
  setState({ queue: queueAdd(queue, ...tracks) });
  return Promise.resolve();
}

export function removeFromQueue(index: number): void {
  setState({ queue: removeAt(state().queue, index) });
}

export function moveInQueue(from: number, to: number): void {
  setState({ queue: moveTrack(state().queue, from, to) });
}

export function clearQueue(): void {
  setState({ queue: clearUpcoming(state().queue) });
}

// ---- Shuffle / repeat ----

export function toggleShuffle(): void {
  const { shuffle, queue, unshuffled } = state();
  if (shuffle) {
    setState({
      shuffle: false,
      queue: unshuffled ? unshuffleQueue(queue, unshuffled) : queue,
      unshuffled: null,
    });
  } else {
    setState({ shuffle: true, unshuffled: queue.tracks, queue: shuffleQueue(queue) });
  }
}

const REPEAT_ORDER: RepeatMode[] = ['off', 'all', 'one'];

/** off -> all -> one -> off */
export function cycleRepeat(): void {
  const i = REPEAT_ORDER.indexOf(state().repeat);
  setState({ repeat: REPEAT_ORDER[(i + 1) % REPEAT_ORDER.length] ?? 'off' });
}

/** Test-only: drop the native player and module state. */
export function __resetEngineForTests(): void {
  player?.remove();
  player = null;
  resolveStreamUrl = null;
  prefetcher = null;
  loadToken = 0;
  lockScreenActive = false;
}
