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
import { AppState } from 'react-native';
import { isTrackUnavailable } from '@/lib/errors';
import { isOffline, isPlayableOffline } from '@/lib/network';
import type { PlaybackSource, Track } from '@/sources/types';
import { usePlayerStore, type PlayerState } from '@/store/playerStore';
import { useProfileStore } from '@/store/profileStore';
import { useRecentStore } from '@/store/recentStore';
import { STREAK_MIN_LISTEN_SEC, useStreakStore } from '@/store/streakStore';
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
import { intercept } from './remote';

/** Resolves a playable source for a track (wired to the source registry at app start). */
export type StreamResolver = (
  track: Track,
  options?: { preferDownload?: boolean },
) => Promise<PlaybackSource>;

/** Warms up the next track while the current one plays (wired to the registry at app start). */
export type Prefetcher = (track: Track) => Promise<void>;

/** prev() restarts the current track instead of going back when past this point. */
const RESTART_THRESHOLD_SEC = 3;
/** A direct stream that hasn't moved after this long is replaced with a download. */
const STREAM_STALL_MS = 12_000;

let player: AudioPlayer | null = null;
let resolveStreamUrl: StreamResolver | null = null;
let prefetcher: Prefetcher | null = null;
/** Incremented on every load; a stale async load must not override a newer one. */
let loadToken = 0;
/**
 * Set when the current track streams directly. If the player rejects that stream the
 * engine asks the source once more for a downloaded file (e.g. YouTube 403).
 */
let playbackFallback: { trackId: string; used: boolean; retrying: boolean } | null = null;
/** Startup watchdog for a direct stream that stalls without reporting an error. */
let stallTimer: ReturnType<typeof setTimeout> | null = null;
let lockScreenActive = false;
/** The new track's real length isn't on the lock screen yet (sent once the stream is ready). */
let lockScreenPending = false;
/** loadToken whose audio is actually in the player. Status events from an older source are ignored. */
let sourceToken = 0;

const state = () => usePlayerStore.getState();

/** Listening time of the song that is playing now (for listening history). */
const listen = { at: null as number | null, sec: 0, lastPos: 0 };

/** Close the current play with how long it was actually listened to. */
function finishListen(): void {
  if (listen.at !== null) useProfileStore.getState().finishListen(listen.at, listen.sec);
  listen.at = null;
  listen.sec = 0;
  listen.lastPos = 0;
}

/** Count only real playback: small forward steps while playing (not seeks). */
function countListen(positionSec: number, playing: boolean): void {
  if (listen.at === null) return;
  const delta = positionSec - listen.lastPos;
  if (playing && delta > 0 && delta <= 2) {
    const before = Math.floor(listen.sec / 10);
    const wasShort = listen.sec < STREAK_MIN_LISTEN_SEC;
    listen.sec += delta;
    // 30 s of real listening counts today for the daily streak.
    if (wasShort && listen.sec >= STREAK_MIN_LISTEN_SEC) useStreakStore.getState().markListened();
    // Checkpoint every 10 s so a killed app still knows how long this song was heard.
    if (Math.floor(listen.sec / 10) !== before) {
      useProfileStore.setState({ openListen: { at: listen.at, sec: Math.round(listen.sec) } });
    }
  }
  listen.lastPos = positionSec;
}

function setState(partial: Partial<PlayerState>): void {
  usePlayerStore.setState(partial);
}

/** expo-audio source object; headers are only included when the source needs them. */
function toAudioSource(source: PlaybackSource): { uri: string; headers?: Record<string, string> } {
  return source.headers ? { uri: source.uri, headers: source.headers } : { uri: source.uri };
}

function clearStallTimer(): void {
  if (stallTimer !== null) {
    clearTimeout(stallTimer);
    stallTimer = null;
  }
}

/**
 * A direct stream sometimes sits at 0 s without an error (YouTube throttles the first
 * request). If that happens, download the track instead of buffering forever.
 */
function armStallWatchdog(track: Track, source: PlaybackSource): void {
  clearStallTimer();
  if (!source.canDownloadFallback) return;
  const token = loadToken;
  const timer = setTimeout(() => {
    stallTimer = null;
    const s = state();
    if (token !== loadToken || s.status !== 'playing' || s.positionSec > 0.5) return;
    if (!playbackFallback || playbackFallback.trackId !== track.id || playbackFallback.used) return;
    console.warn(`[player] stream stalled (${track.id}), retrying as a download`);
    retryWithDownload(track);
  }, STREAM_STALL_MS);
  // Jest/Node keep the process alive for pending timers; this is a no-op in React Native.
  (timer as unknown as { unref?: () => void }).unref?.();
  stallTimer = timer;
}

/**
 * The direct stream failed: ask the source for a downloaded file and play it instead.
 * Runs at most once per track (playbackFallback), so a broken source cannot loop.
 */
function retryWithDownload(track: Track): boolean {
  if (!resolveStreamUrl) return false;
  const fallback = playbackFallback;
  if (!fallback || fallback.trackId !== track.id || fallback.used) return false;
  fallback.used = true;
  fallback.retrying = true;
  clearStallTimer();
  const token = ++loadToken;
  setState({ status: 'loading', error: null, positionSec: 0 });
  void (async () => {
    try {
      const source = await resolveStreamUrl(track, { preferDownload: true });
      if (token !== loadToken) return;
      const p = getPlayer();
      p.replace(toAudioSource(source));
      sourceToken = token;
      p.play();
      if (playbackFallback === fallback) fallback.retrying = false;
      setState({ status: 'playing' });
      prefetchNext(state().queue);
    } catch (err) {
      if (token !== loadToken) return;
      if (playbackFallback === fallback) fallback.retrying = false;
      setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true;
}

function onStatus(status: AudioStatus): void {
  // Still reporting the previous song while the next one resolves (slow network):
  // its position / finish / error must not leak into the new song's state.
  if (sourceToken !== loadToken) return;
  const { status: current } = state();
  const patch: Partial<PlayerState> = { positionSec: status.currentTime };
  countListen(status.currentTime, status.playing);
  if (status.duration > 0) patch.durationSec = status.duration;
  if (lockScreenPending && status.isLoaded && !status.isBuffering && status.duration > 0) {
    lockScreenPending = false;
    refreshLockScreen(status.duration);
  }
  // Native player failed (bad URL, HTTP 403, unsupported codec...). Without this the UI
  // would sit on "playing" with no sound.
  if (status.error && (current === 'playing' || current === 'loading')) {
    const track = currentTrack(state().queue);
    // The old player keeps reporting its failure while the download fallback runs.
    if (playbackFallback?.retrying) return;
    clearStallTimer();
    // A direct stream may be refused while the downloaded copy still works (YouTube).
    // Only near the start: a mid-song network error must not download a full track.
    if (
      track &&
      playbackFallback?.trackId === track.id &&
      !playbackFallback.used &&
      (current === 'loading' || status.currentTime < 5)
    ) {
      console.warn(
        `[player] direct stream failed (${track.id}), retrying as a download: ${status.error}`,
      );
      if (retryWithDownload(track)) return;
    }
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
  const remaining =
    durationSec > 0 ? Math.max(0, durationSec - positionSec) : Number.POSITIVE_INFINITY;
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
  finishListen();
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

function lockScreenMetadata(track: Track, durationSec?: number) {
  const length = durationSec && durationSec > 0 ? durationSec : track.durationSec;
  return {
    title: track.title,
    artist: track.artist,
    albumTitle: track.album,
    artworkUrl: track.artworkUrl,
    // Read by the patched native player (scripts/patch-expo-audio.js) so the notification shows
    // the right length even when the stream doesn't report one.
    durationSec: length > 0 ? length : undefined,
  };
}

function updateLockScreen(p: AudioPlayer, track: Track): void {
  const metadata = lockScreenMetadata(track);
  try {
    if (!lockScreenActive) {
      p.setActiveForLockScreen(true, metadata, {
        showSeekForward: true,
        showSeekBackward: true,
        showNextTrack: true,
        showPreviousTrack: true,
        // Never treat a song stream as "live" (that hides the progress bar).
        isLiveStream: false,
      } as Parameters<AudioPlayer['setActiveForLockScreen']>[2]);
      lockScreenActive = true;
    } else {
      p.updateLockScreenMetadata(metadata);
    }
  } catch {
    // Lock-screen controls are best effort; playback must not fail because of them.
  }
}

/** Re-send the current song to the notification / lock screen (e.g. once its length is known). */
function refreshLockScreen(durationSec?: number): void {
  const track = currentTrack(state().queue);
  if (!player || !lockScreenActive || !track) return;
  try {
    player.updateLockScreenMetadata(lockScreenMetadata(track, durationSec ?? state().durationSec));
  } catch {
    // best effort
  }
}

// Coming back to the app: make sure the notification shows the current song.
AppState.addEventListener('change', (s) => {
  if (s === 'active') refreshLockScreen();
});

/** Finds songs to continue with when the queue runs out (autoplay / radio). */
export type AutoplayProvider = (seed: Track, queue: readonly Track[]) => Promise<Track[]>;
let autoplayProvider: AutoplayProvider | null = null;
let autoplayPending: Promise<boolean> | null = null;

/** Inject the autoplay provider (src/lib/autoplay.ts). Optional. */
export function setAutoplayProvider(fn: AutoplayProvider | null): void {
  autoplayProvider = fn;
}

/**
 * When the last song of the queue starts, append similar songs in the background so
 * "Up next", prefetch and the lock-screen Next button keep working. Returns true if
 * songs were added. Runs once at a time.
 */
function topUpQueue(): Promise<boolean> {
  if (autoplayPending) return autoplayPending;
  const { queue, repeat } = state();
  const seed = currentTrack(queue);
  if (!autoplayProvider || !seed || repeat !== 'off' || queue.index < queue.tracks.length - 1) {
    return Promise.resolve(false);
  }
  autoplayPending = autoplayProvider(seed, queue.tracks)
    .then((more) => {
      const latest = state().queue;
      // The user changed the queue meanwhile (or nothing found): leave it alone.
      if (more.length === 0 || latest.tracks.length !== queue.tracks.length) return false;
      setState({ queue: queueAdd(latest, ...more) });
      prefetchNext(state().queue);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      autoplayPending = null;
    });
  return autoplayPending;
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
  finishListen();
  clearStallTimer();
  playbackFallback = null;
  setState({
    queue,
    status: 'loading',
    positionSec: 0,
    durationSec: track.durationSec,
    error: null,
  });
  // Silence the old song and show the new one right away; resolving can take seconds on a bad network.
  if (player) {
    try {
      player.pause();
    } catch {
      // best effort
    }
    updateLockScreen(player, track);
  }
  try {
    const resolveTimeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection timed out. Check your internet connection.'));
      }, 10_000);
      (timer as unknown as { unref?: () => void }).unref?.();
    });
    const source = await Promise.race([resolveStreamUrl(track), resolveTimeout]);
    if (token !== loadToken) return;
    playbackFallback = source.canDownloadFallback
      ? { trackId: track.id, used: false, retrying: false }
      : null;
    const p = getPlayer();
    p.replace(toAudioSource(source));
    sourceToken = token;
    p.play();
    setState({ status: 'playing' });
    armStallWatchdog(track, source);
    updateLockScreen(p, track);
    lockScreenPending = true;
    useRecentStore.getState().add(track);
    useProfileStore.getState().recordPlay(track);
    listen.at = useProfileStore.getState().history[0]?.at ?? null;
    listen.lastPos = 0;
    prefetchNext(queue);
    // Last song in the queue: line up similar songs (autoplay) in the background.
    void topUpQueue();
  } catch (err) {
    if (token !== loadToken) return;
    if (isOffline() && !isPlayableOffline(track)) {
      setState({
        status: 'error',
        error: "You're offline and this song isn't saved on your phone.",
      });
      return;
    }
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
  if (intercept({ type: 'play', track })) return Promise.resolve();
  const queue = state().queue;
  if (queue.tracks.some((t) => t.id === track.id)) return loadAndPlay(selectTrack(queue, track));
  return startQueue([track], 0);
}

/** Replace the queue with `tracks` and start at `startIndex`. */
export function playQueue(tracks: readonly Track[], startIndex = 0): Promise<void> {
  const start = tracks[startIndex];
  if (start && intercept({ type: 'play', track: start })) return Promise.resolve();
  return startQueue(tracks, startIndex);
}

/** Jump to a position in the current queue. */
export function jumpTo(index: number): Promise<void> {
  const { queue } = state();
  const target = queue.tracks[index];
  if (target && intercept({ type: 'play', track: target })) return Promise.resolve();
  if (index < 0 || index >= queue.tracks.length) return Promise.resolve();
  return loadAndPlay({ ...queue, index });
}

/** Load the current song again (after an error). */
export function retry(): Promise<void> {
  const { queue } = state();
  if (queue.index < 0) return Promise.resolve();
  return jumpTo(queue.index);
}

export function pause(): void {
  if (intercept({ type: 'pause' })) return;
  if (!player) return;
  player.pause();
  setState({ status: 'paused' });
}

export function resume(): void {
  if (intercept({ type: 'resume' })) return;
  if (!player || state().status !== 'paused') return;
  player.play();
  setState({ status: 'playing' });
}

export async function seek(sec: number): Promise<void> {
  if (intercept({ type: 'seek', sec: Math.max(0, sec) })) return;
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

/** Offline: jump over songs that need internet. Null when none of the rest can play. */
function skipOnlineOnly(queue: QueueState, pos: number, repeat: RepeatMode): number | null {
  if (!isOffline()) return pos;
  let p: number | null = pos;
  for (let i = 0; i < queue.tracks.length && p !== null; i++) {
    const t = queue.tracks[p];
    if (t && isPlayableOffline(t)) return p;
    p = nextPosition({ ...queue, index: p }, repeat === 'one' ? 'off' : repeat, false);
    if (p === pos) break;
  }
  return null;
}

async function advance(auto: boolean): Promise<void> {
  // Sleep timer due: the song ended, so stop here instead of playing the next one.
  if (auto && sleepDue(useSleepStore.getState(), Date.now())) {
    stopForSleep();
    return;
  }
  const { queue, repeat } = state();
  let pos = nextPosition(queue, repeat, auto);
  if (pos === null && (await topUpQueue())) {
    // Autoplay just added songs: continue with the first of them.
    const topped = state();
    pos = nextPosition(topped.queue, topped.repeat, auto);
    if (pos !== null) {
      await loadAndPlay({ ...topped.queue, index: pos });
      return;
    }
  }
  if (pos === null) {
    finishListen();
    player?.pause();
    setState({ status: 'idle', positionSec: 0 });
    return;
  }
  if (!(auto && pos === queue.index)) {
    const playable = skipOnlineOnly(queue, pos, repeat);
    if (playable === null) {
      finishListen();
      player?.pause();
      setState({
        status: 'idle',
        positionSec: 0,
        error: 'Offline: no saved songs left in the queue.',
      });
      return;
    }
    pos = playable;
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
  if (intercept({ type: 'next' })) return Promise.resolve();
  return advance(false);
}

/** Restart the current track if past a few seconds, otherwise go to the previous one. */
export async function prev(): Promise<void> {
  if (intercept({ type: 'prev' })) return;
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
  if (intercept({ type: 'playNext', tracks })) return Promise.resolve();
  const { queue } = state();
  if (queue.index < 0) return startQueue(tracks, 0);
  setState({ queue: queuePlayNext(queue, ...tracks) });
  prefetchNext(state().queue);
  return Promise.resolve();
}

/** Append tracks to the end of the queue. Starts playback if nothing is queued. */
export function addToQueue(tracks: Track[]): Promise<void> {
  if (intercept({ type: 'add', tracks })) return Promise.resolve();
  const { queue } = state();
  if (queue.index < 0) return startQueue(tracks, 0);
  setState({ queue: queueAdd(queue, ...tracks) });
  prefetchNext(state().queue);
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

/** Stop and clear everything (e.g. leaving someone's Jam: their songs shouldn't keep playing). */
export function stop(): void {
  finishListen();
  clearStallTimer();
  playbackFallback = null;
  player?.pause();
  lockScreenPending = false;
  setState({
    status: 'idle',
    positionSec: 0,
    queue: createQueue([]),
    unshuffled: null,
    error: null,
  });
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
  autoplayProvider = null;
  autoplayPending = null;
  listen.at = null;
  listen.sec = 0;
  listen.lastPos = 0;
  loadToken = 0;
  clearStallTimer();
  playbackFallback = null;
  lockScreenActive = false;
  lockScreenPending = false;
  sourceToken = 0;
}
