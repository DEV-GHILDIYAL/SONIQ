import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { Track } from '@/sources/types';
import { initialPlayerState, usePlayerStore } from '@/store/playerStore';
import { TrackUnavailableError } from '@/lib/errors';
import { useRecentStore } from '@/store/recentStore';
import { useUnavailableStore } from '@/store/unavailableStore';
import * as engine from './engine';
import { cancelSleepTimer, sleepAtEndOfTrack } from './sleep';

// jest.mock is hoisted above the imports by babel-jest.

type StatusListener = (status: {
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
}) => void;

// Mock of the native expo-audio player. No real audio is played.
const mockPlayer = {
  currentTime: 0,
  listener: null as StatusListener | null,
  remote: {} as Record<string, () => void>,
  play: jest.fn(),
  pause: jest.fn(),
  replace: jest.fn(),
  seekTo: jest.fn(() => Promise.resolve()),
  remove: jest.fn(),
  setActiveForLockScreen: jest.fn(),
  updateLockScreenMetadata: jest.fn(),
  addListener: jest.fn((event: string, cb: StatusListener) => {
    if (event === 'playbackStatusUpdate') mockPlayer.listener = cb;
    else mockPlayer.remote[event] = cb as unknown as () => void;
    return { remove: jest.fn() };
  }),
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));

const t = (n: number): Track => ({
  id: `jamendo:${n}`,
  title: `Track ${n}`,
  artist: 'Artist',
  durationSec: 120,
  source: 'jamendo',
});

const resolver = jest.fn((track: Track) => Promise.resolve(`https://example.test/${track.id}.mp3`));

beforeEach(() => {
  jest.clearAllMocks();
  engine.__resetEngineForTests();
  mockPlayer.currentTime = 0;
  mockPlayer.listener = null;
  usePlayerStore.setState({ ...initialPlayerState });
  useRecentStore.getState().clear();
  useUnavailableStore.getState().clear();
  engine.setStreamResolver(resolver);
});

describe('player engine', () => {
  it('play() resolves the stream URL, loads it and starts playback', async () => {
    await engine.play(t(1));

    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ shouldPlayInBackground: true }),
    );
    expect(resolver).toHaveBeenCalledWith(t(1));
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'https://example.test/jamendo:1.mp3' });
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(usePlayerStore.getState().status).toBe('playing');
  });

  it('records played tracks in recently played, but not failed loads', async () => {
    await engine.play(t(1));
    expect(useRecentStore.getState().tracks.map((x) => x.id)).toEqual(['jamendo:1']);

    resolver.mockRejectedValueOnce(new Error('boom'));
    await engine.play(t(2));
    expect(useRecentStore.getState().tracks.map((x) => x.id)).toEqual(['jamendo:1']);
  });

  it('reuses a single native player across tracks', async () => {
    await engine.play(t(1));
    await engine.play(t(2));
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it('pause() and resume() toggle playback', async () => {
    await engine.play(t(1));
    engine.pause();
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(usePlayerStore.getState().status).toBe('paused');

    mockPlayer.play.mockClear();
    engine.resume();
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().status).toBe('playing');
  });

  it('seek() clamps negatives to 0', async () => {
    await engine.play(t(1));
    await engine.seek(-5);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    await engine.seek(42);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(42);
    expect(usePlayerStore.getState().positionSec).toBe(42);
  });

  it('seekBy() jumps ±30s and stays inside the track', async () => {
    await engine.play(t(1));
    usePlayerStore.setState({ positionSec: 50, durationSec: 200 });
    await engine.seekBy(30);
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(80);
    await engine.seekBy(-30);
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(50);
    usePlayerStore.setState({ positionSec: 10 });
    await engine.seekBy(-30);
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
    usePlayerStore.setState({ positionSec: 190 });
    await engine.seekBy(30);
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(199);
  });

  it('sleep timer stops after the current song instead of playing the next', async () => {
    await engine.playQueue([t(1), t(2)], 0);
    sleepAtEndOfTrack();
    mockPlayer.listener?.({ currentTime: 120, duration: 120, didJustFinish: true });
    await Promise.resolve();
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(usePlayerStore.getState().queue.index).toBe(0);
    expect(usePlayerStore.getState().status).toBe('paused');
    cancelSleepTimer();
  });

  it('notification Next / Previous buttons move through the queue', async () => {
    await engine.playQueue([t(1), t(2)], 0);
    expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
      true,
      expect.anything(),
      expect.objectContaining({ showNextTrack: true, showPreviousTrack: true }),
    );
    mockPlayer.remote.lockScreenNext?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(usePlayerStore.getState().queue.index).toBe(1);
    mockPlayer.remote.lockScreenPrevious?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(usePlayerStore.getState().queue.index).toBe(0);
  });

  it('next() and prev() walk the queue', async () => {
    await engine.playQueue([t(1), t(2), t(3)]);
    await engine.next();
    expect(usePlayerStore.getState().queue.index).toBe(1);
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({
      uri: 'https://example.test/jamendo:2.mp3',
    });

    await engine.prev();
    expect(usePlayerStore.getState().queue.index).toBe(0);
  });

  it('prev() restarts the track when past 3 seconds', async () => {
    await engine.playQueue([t(1), t(2)], 1);
    mockPlayer.currentTime = 10;
    await engine.prev();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(usePlayerStore.getState().queue.index).toBe(1);
  });

  it('next() at the end of the queue stops playback', async () => {
    await engine.play(t(1));
    await engine.next();
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(usePlayerStore.getState().status).toBe('idle');
  });

  it('auto-advances when a track finishes', async () => {
    await engine.playQueue([t(1), t(2)]);
    mockPlayer.listener?.({ currentTime: 120, duration: 120, didJustFinish: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(usePlayerStore.getState().queue.index).toBe(1);
  });

  it('sets error status when the stream URL cannot be resolved', async () => {
    resolver.mockRejectedValueOnce(new Error('network down'));
    await engine.play(t(1));
    expect(usePlayerStore.getState()).toMatchObject({ status: 'error', error: 'network down' });
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('ignores a stale load when a newer play() wins', async () => {
    let releaseFirst: (url: string) => void = () => {};
    resolver.mockImplementationOnce(() => new Promise<string>((r) => (releaseFirst = r)));
    const first = engine.play(t(1));
    await engine.play(t(2));
    releaseFirst('https://example.test/stale.mp3');
    await first;
    expect(mockPlayer.replace).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'https://example.test/jamendo:2.mp3' });
  });

  it('shows the track on the lock screen, then only updates metadata', async () => {
    await engine.play(t(1));
    expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ title: 'Track 1', artist: 'Artist' }),
      expect.objectContaining({ showSeekForward: true, showSeekBackward: true }),
    );
    await engine.play(t(2));
    expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledTimes(1);
    expect(mockPlayer.updateLockScreenMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Track 2' }),
    );
  });

  it('syncs pause/play pressed on the lock screen', async () => {
    await engine.play(t(1));
    const status = {
      currentTime: 5,
      duration: 120,
      didJustFinish: false,
      isLoaded: true,
      isBuffering: false,
    };
    mockPlayer.listener?.({ ...status, playing: false } as never);
    expect(usePlayerStore.getState().status).toBe('paused');
    mockPlayer.listener?.({ ...status, playing: true } as never);
    expect(usePlayerStore.getState().status).toBe('playing');
  });

  it('repeat-one replays the finished track; repeat-all wraps around', async () => {
    await engine.playQueue([t(1), t(2)], 1);
    usePlayerStore.setState({ repeat: 'one' });
    mockPlayer.listener?.({ currentTime: 120, duration: 120, didJustFinish: true } as never);
    await Promise.resolve();
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(usePlayerStore.getState().queue.index).toBe(1);

    usePlayerStore.setState({ repeat: 'all' });
    await engine.next();
    expect(usePlayerStore.getState().queue.index).toBe(0);
  });

  it('toggleShuffle shuffles and then restores the original order', async () => {
    await engine.playQueue([t(1), t(2), t(3), t(4)], 1);
    engine.toggleShuffle();
    const s = usePlayerStore.getState();
    expect(s.shuffle).toBe(true);
    expect(s.queue.tracks[s.queue.index]?.id).toBe('jamendo:2');
    engine.toggleShuffle();
    expect(usePlayerStore.getState().queue.tracks.map((x) => x.id)).toEqual(
      [t(1), t(2), t(3), t(4)].map((x) => x.id),
    );
  });

  it('cycleRepeat goes off -> all -> one -> off', () => {
    engine.cycleRepeat();
    expect(usePlayerStore.getState().repeat).toBe('all');
    engine.cycleRepeat();
    expect(usePlayerStore.getState().repeat).toBe('one');
    engine.cycleRepeat();
    expect(usePlayerStore.getState().repeat).toBe('off');
  });

  it('playNext / addToQueue edit the queue without reloading', async () => {
    await engine.playQueue([t(1), t(2)], 0);
    mockPlayer.replace.mockClear();
    await engine.playNext([t(9)]);
    await engine.addToQueue([t(8)]);
    expect(usePlayerStore.getState().queue.tracks.map((x) => x.id)).toEqual([
      'jamendo:1',
      'jamendo:9',
      'jamendo:2',
      'jamendo:8',
    ]);
    expect(mockPlayer.replace).not.toHaveBeenCalled();
  });

  it('hides and skips permanently unavailable tracks', async () => {
    resolver.mockImplementation(async (track: Track) => {
      if (track.id === 'jamendo:1') throw new TrackUnavailableError('gone');
      return `https://example.test/${track.id}.mp3`;
    });
    await engine.playQueue([t(1), t(2)], 0);
    expect(useUnavailableStore.getState().ids).toEqual(['jamendo:1']);
    expect(usePlayerStore.getState().queue.index).toBe(1);
    expect(usePlayerStore.getState().status).toBe('playing');
  });

  it('does not hide tracks on network errors and never loops forever', async () => {
    resolver.mockRejectedValue(new Error('Network error'));
    usePlayerStore.setState({ repeat: 'all' });
    await engine.playQueue([t(1), t(2)], 0);
    expect(useUnavailableStore.getState().ids).toEqual([]);
    expect(usePlayerStore.getState().status).toBe('error');

    resolver.mockRejectedValue(new TrackUnavailableError('gone'));
    await engine.playQueue([t(1), t(2), t(3)], 0);
    expect(usePlayerStore.getState().status).toBe('error');
    expect(resolver.mock.calls.length).toBeLessThan(10);
  });

  // Earlier tests leave rejecting implementations on the shared resolver mock.
  const resolverWorks = () =>
    resolver.mockImplementation((track: Track) =>
      Promise.resolve(`https://example.test/${track.id}.mp3`),
    );

  it('prefetches the next queued track after the current one starts', async () => {
    resolverWorks();
    const prefetch = jest.fn(() => Promise.resolve());
    engine.setPrefetcher(prefetch);
    await engine.playQueue([t(1), t(2), t(3)], 0);
    expect(prefetch).toHaveBeenCalledWith(t(2));
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('does not prefetch past the end of the queue', async () => {
    resolverWorks();
    const prefetch = jest.fn(() => Promise.resolve());
    engine.setPrefetcher(prefetch);
    await engine.playQueue([t(1), t(2)], 1);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('shows native playback errors instead of a silent "playing" state', async () => {
    resolverWorks();
    await engine.play(t(1));
    (mockPlayer.listener as unknown as (s: object) => void)({
      currentTime: 0,
      duration: 0,
      didJustFinish: false,
      error: 'Source error',
    });
    expect(usePlayerStore.getState()).toMatchObject({
      status: 'error',
      error: 'Playback failed: Source error',
    });
  });
});
