/**
 * Jam (listen together) session. One Jam at a time.
 *
 * Host: broadcasts its player state on every play/pause/seek/track change and every 5 s.
 * Guest: follows that state through the player engine (loads the same track itself,
 * seeks to the host's position corrected for clock offset and elapsed time).
 * Guests' own taps (play, pause, next, add...) go to the host via src/player/remote.ts,
 * and the host applies them if its "Guests can" setting allows.
 *
 * Staying connected: the room reconnects on its own when the connection drops (background,
 * network change). A guest never leaves just because the host went quiet: it shows
 * "host offline" and waits up to HOST_GONE_MS. The last Jam is remembered so the app can
 * offer "Rejoin" after it was closed.
 * Transport: src/lib/realtime.ts (Supabase Realtime broadcast + presence).
 */
import { AppState, type NativeEventSubscription } from 'react-native';
import { showSheet } from '@/components/Sheet';
import { endJamCards } from '@/lib/clans';
import { announceJam, endJamAnnouncement } from '@/lib/jamPresence';
import { openRoom, type Room, type RoomMember, type RoomPayload } from '@/lib/realtime';
import {
  addToQueue,
  next,
  pause,
  playNext,
  playQueue,
  prev,
  resume,
  seek,
  stop,
} from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { direct, setRemoteHandler, type RemoteAction } from '@/player/remote';
import type { Track } from '@/sources/types';
import { useJamStore, type GuestMode } from '@/store/jamStore';
import { useProfileStore } from '@/store/profileStore';
import { usePlayerStore } from '@/store/playerStore';
import {
  clockOffset,
  CODE_LENGTH,
  expectedPosition,
  makeJamCode,
  needsSeek,
  normalizeCode,
  type JamState,
  type PingSample,
} from './sync';

const HEARTBEAT_MS = 5_000;
const PING_COUNT = 3;
const PING_GAP_MS = 250;
/** How long a guest waits for the host's first state before giving up. */
const HOST_WAIT_MS = 8_000;
/** Same, when rejoining after the app was closed (host may be reconnecting too). */
const REJOIN_WAIT_MS = 20_000;
/** Position jumps larger than this between two player updates are treated as seeks. */
const SEEK_JUMP_SEC = 2;
const UP_NEXT_COUNT = 10;
/** No state from the host for this long → show "host offline" (guest keeps waiting). */
const HOST_QUIET_MS = 15_000;
/** Guest leaves only if the host has been offline this long (while we were connected). */
const HOST_GONE_MS = 3 * 60_000;
const HOST_CHECK_MS = 2_000;
/** Presence can briefly drop members while someone joins; keep them listed this long. */
const MEMBER_DROP_GRACE_MS = 4_000;
/** Public Jams refresh their server row this often (server forgets them after 90 s). */
const ANNOUNCE_MS = 30_000;
/** "Rejoin Jam?" is offered for this long after the app was closed. */
export const REJOIN_WINDOW_MS = 30 * 60_000;

const memberId = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

let room: Room | null = null;
let cleanups: (() => void)[] = [];
let offsetMs = 0;

const setJam = useJamStore.setState;
const jam = () => useJamStore.getState();

/**
 * Member list that ignores presence blips: new members show at once, a member who
 * disappears stays listed until the grace period passes without them coming back.
 */
function memberList(): { show: (members: RoomMember[]) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const show = (members: RoomMember[]) => {
    cancel();
    const shown = jam().members;
    const missing = shown.filter((s) => !members.some((m) => m.id === s.id));
    if (missing.length === 0) {
      setJam({ members });
      return;
    }
    setJam({ members: [...members, ...missing] });
    timer = setTimeout(() => {
      timer = null;
      if (jam().status !== 'idle') setJam({ members });
    }, MEMBER_DROP_GRACE_MS);
  };
  return { show, cancel };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const myUid = () => useProfileStore.getState().profile?.id;
const displayName = (role: 'host' | 'guest') =>
  useProfileStore.getState().profile?.name.trim() ||
  jam().myName.trim() ||
  (role === 'host' ? 'Host' : 'Listener');

/** Remember the Jam (for "Rejoin" after the app was closed). */
function rememberJam(): void {
  const s = jam();
  if (s.status !== 'active' || !s.code || !s.role) return;
  setJam({
    lastJam: {
      code: s.code,
      role: s.role,
      isPublic: s.isPublic,
      guestMode: s.guestMode,
      at: Date.now(),
    },
  });
}

/** Run when the app comes back to the foreground during a Jam. */
let onForeground: (() => void) | null = null;
let appStateSub: NativeEventSubscription | null = null;
function watchAppState(): void {
  appStateSub ??= AppState.addEventListener('change', (state) => {
    if (state === 'active') onForeground?.();
  });
}

// ---- Public Jam announcement (friends see it) ----

let announceTimer: ReturnType<typeof setInterval> | null = null;

/** Publish the Jam if it's public and active, otherwise remove it. Best effort. */
function syncAnnouncement(): void {
  const s = jam();
  if (s.status === 'active' && s.isPublic && s.code) {
    const track = currentTrack(usePlayerStore.getState().queue);
    void announceJam({
      code: s.code,
      host: s.role === 'host',
      title: track && track.source !== 'local' ? track.title : null,
      artist: track && track.source !== 'local' ? track.artist : null,
      members: Math.max(1, s.members.length),
    }).catch(() => {});
    announceTimer ??= setInterval(syncAnnouncement, ANNOUNCE_MS);
  } else {
    if (announceTimer) clearInterval(announceTimer);
    announceTimer = null;
    void endJamAnnouncement().catch(() => {});
  }
}

// ---- Host ----

/** Profile IDs the host removed; they get kicked again if they come back. */
const kicked = new Set<string>();
/** Who added which track (track id → name), shown in "Up next". */
let addedBy: Record<string, string> = {};

function playerSnapshot(): JamState {
  const s = usePlayerStore.getState();
  const q = s.queue;
  const upNext = q.index >= 0 ? q.tracks.slice(q.index + 1, q.index + 1 + UP_NEXT_COUNT) : [];
  const upNextBy: Record<string, string> = {};
  for (const t of upNext) {
    const by = addedBy[t.id];
    if (by) upNextBy[t.id] = by;
  }
  return {
    track: currentTrack(q) ?? null,
    positionSec: s.positionSec,
    playing: s.status === 'playing' || s.status === 'loading',
    sentAt: Date.now(),
    upNext,
    isPublic: jam().isPublic,
    guestMode: jam().guestMode,
    upNextBy,
  };
}

function broadcastState(): void {
  if (!room) return;
  const state = playerSnapshot();
  room.send('state', state as unknown as RoomPayload);
  setJam({
    upNext: state.upNext,
    upNextBy: state.upNextBy ?? {},
    notice:
      state.track?.source === 'local'
        ? "Local files can't be shared in a Jam. Friends will skip this song."
        : jam().notice,
  });
}

const ACTION_TEXT: Record<string, string> = {
  pause: 'paused',
  resume: 'resumed',
  next: 'skipped to the next song',
  prev: 'went back a song',
  seek: 'jumped in the song',
};

/** Host: apply something a guest asked for, if the guest setting allows it. */
function handleGuestRequest(p: RoomPayload): void {
  const mode = jam().guestMode;
  const by = String(p.by ?? 'A friend').slice(0, 24);
  const kind = String(p.kind ?? '');
  const track = p.track as Track | undefined;

  if (kind === 'add' || kind === 'playNext') {
    if (mode === 'listen' || !track?.id || track.source === 'local') return;
    addedBy[track.id] = by;
    void (kind === 'playNext' ? playNext([track]) : addToQueue([track])).then(broadcastState);
    setJam({ notice: `${by} added ${track.title}` });
    return;
  }
  if (mode !== 'control') return;
  if (kind === 'play' && track?.id && track.source !== 'local') {
    addedBy[track.id] = by;
    void playNext([track])
      .then(() => next())
      .then(broadcastState);
    setJam({ notice: `${by} played ${track.title}` });
    return;
  }
  if (kind === 'pause') pause();
  else if (kind === 'resume') resume();
  else if (kind === 'next') void next();
  else if (kind === 'prev') void prev();
  else if (kind === 'seek' && Number.isFinite(Number(p.sec))) void seek(Number(p.sec));
  else return;
  if (ACTION_TEXT[kind]) setJam({ notice: `${by} ${ACTION_TEXT[kind]}` });
}

/**
 * Start a Jam as host. Resolves with the room code. Private by default.
 * Pass `code` to host the same Jam again (rejoin after the app was closed).
 */
export async function startJam(
  isPublic = false,
  code?: string,
  guestMode: GuestMode = 'add',
): Promise<string> {
  await leaveJam(undefined, false, false);
  kicked.clear();
  addedBy = {};
  const roomCode =
    code && normalizeCode(code).length === CODE_LENGTH ? normalizeCode(code) : makeJamCode();
  setJam({
    status: 'connecting',
    role: 'host',
    code: roomCode,
    isPublic,
    guestMode,
    reconnecting: false,
    hostOffline: false,
    error: null,
    notice: null,
    members: [],
    upNextBy: {},
  });
  const r = openRoom(roomCode, memberId);

  r.on('ping', (p) => r.send('pong', { id: p.id, sentAt: p.sentAt, hostTime: Date.now() }));
  r.on('hello', () => broadcastState());
  r.on('request', handleGuestRequest);
  // Older builds send queue-add.
  r.on('queue-add', (p) => handleGuestRequest({ ...p, kind: 'add' }));
  const hostMembers = memberList();
  r.onMembers((members) => {
    // Someone the host removed came back: remove them again and don't list them.
    const back = members.filter((m) => m.role !== 'host' && m.uid && kicked.has(m.uid));
    for (const m of back) r.send('kick', { id: m.id });
    hostMembers.show(members.filter((m) => !back.includes(m)));
  });
  r.onConnection?.((connected) => {
    setJam({ reconnecting: !connected });
    if (connected) broadcastState();
  });

  try {
    await r.join({ id: memberId, name: displayName('host'), role: 'host', uid: myUid() });
  } catch (err) {
    setJam({ status: 'idle', role: null, code: null, error: (err as Error).message });
    throw err;
  }
  room = r;

  // Broadcast on anything a listener would notice.
  const unsubscribe = usePlayerStore.subscribe((s, prevState) => {
    const trackChanged = currentTrack(s.queue)?.id !== currentTrack(prevState.queue)?.id;
    const statusChanged = s.status !== prevState.status;
    const seeked = Math.abs(s.positionSec - prevState.positionSec) > SEEK_JUMP_SEC;
    const queueChanged = s.queue.tracks !== prevState.queue.tracks;
    if (trackChanged || statusChanged || seeked || queueChanged) broadcastState();
  });
  let beats = 0;
  const heartbeat = setInterval(() => {
    broadcastState();
    if (++beats % 12 === 0) rememberJam(); // about once a minute
  }, HEARTBEAT_MS);
  onForeground = () => {
    r.ensureConnected?.();
    broadcastState();
    rememberJam();
  };
  watchAppState();
  cleanups = [unsubscribe, () => clearInterval(heartbeat), hostMembers.cancel];

  setJam({ status: 'active' });
  rememberJam();
  broadcastState();
  syncAnnouncement();
  return roomCode;
}

/** Host: make the Jam public (friends see it, link joins) or private (code only, hidden). */
export function setJamPublic(isPublic: boolean): void {
  if (jam().role !== 'host') return;
  setJam({ isPublic });
  broadcastState();
  syncAnnouncement();
  rememberJam();
}

/** Host: what guests may do (listen / add songs / full control). */
export function setGuestMode(guestMode: GuestMode): void {
  if (jam().role !== 'host') return;
  setJam({ guestMode });
  broadcastState();
  rememberJam();
}

/** Host: remove a listener. They're kept out for the rest of this Jam. */
export function kickMember(member: RoomMember): void {
  if (!room || jam().role !== 'host' || member.role === 'host') return;
  if (member.uid) kicked.add(member.uid);
  room.send('kick', { id: member.id });
  setJam((s) => ({
    members: s.members.filter((m) => m.id !== member.id),
    notice: `Removed ${member.name} from the Jam`,
  }));
}

// ---- Guest ----

let latest: JamState | null = null;
let applying = false;

function enqueueState(state: JamState): void {
  latest = state; // newer states replace older unapplied ones
  if (!applying) void drain();
}

async function drain(): Promise<void> {
  applying = true;
  try {
    while (latest) {
      const state = latest;
      latest = null;
      try {
        await applyState(state);
      } catch (err) {
        setJam({ notice: `Couldn't follow the host: ${(err as Error).message}` });
      }
    }
  } finally {
    applying = false;
  }
}

const hostNow = () => Date.now() + offsetMs;

/** Make the local player match the host's state. */
export async function applyState(state: JamState): Promise<void> {
  setJam({ upNext: state.upNext, upNextBy: state.upNextBy ?? {}, hostOffline: false });
  const isPublic = state.isPublic === true;
  const guestMode = state.guestMode ?? 'add';
  if (jam().guestMode !== guestMode) setJam({ guestMode });
  if (jam().isPublic !== isPublic) {
    setJam({ isPublic });
    syncAnnouncement();
  }
  const player = usePlayerStore.getState();
  const local = currentTrack(player.queue);

  if (!state.track) {
    if (player.status === 'playing') direct(() => pause());
    return;
  }
  if (state.track.source === 'local') {
    if (player.status === 'playing') direct(() => pause());
    setJam({ notice: 'The host is playing a local file, which can’t be shared.' });
    return;
  }

  if (local?.id !== state.track.id) {
    // Load the host's track (plus what's next), then jump to where the host is now.
    const host = state.track;
    await direct(() => playQueue([host, ...state.upNext.filter((t) => t.source !== 'local')], 0));
    if (!state.playing) direct(() => pause());
    else await direct(() => seek(expectedPosition(state, hostNow())));
    return;
  }

  const now = usePlayerStore.getState();
  if (now.status === 'loading' || now.status === 'error') return;
  if (!state.playing) {
    if (now.status === 'playing') direct(() => pause());
    if (needsSeek(now.positionSec, state.positionSec)) await direct(() => seek(state.positionSec));
    return;
  }
  if (now.status === 'paused' || now.status === 'idle') direct(() => resume());
  const expected = expectedPosition(state, hostNow());
  if (needsSeek(now.positionSec, expected)) await direct(() => seek(expected));
}

const ONLY_HOST: Record<GuestMode, string> = {
  listen: 'In this Jam only the host picks songs and controls playback.',
  add: 'Only the host controls playback. You can add songs (⋮ → Add to queue).',
  control: '',
};

/** Not allowed in this Jam: say so where the guest is looking (any screen). */
function refuse(message: string): void {
  setJam({ notice: message });
  showSheet('The host controls this Jam', message);
}

/** Guest: send the player action to the host (or explain why it's not allowed). */
function guestAction(action: RemoteAction): boolean {
  const mode = jam().guestMode;
  const by = displayName('guest');
  const send = (kind: string, extra: RoomPayload = {}) =>
    room?.send('request', { kind, by, ...extra });

  if (action.type === 'add' || action.type === 'playNext') {
    if (mode === 'listen') {
      refuse(ONLY_HOST.listen);
      return true;
    }
    const tracks = action.tracks.filter((t) => t.source !== 'local');
    if (tracks.length < action.tracks.length)
      setJam({ notice: "Local files can't be shared in a Jam." });
    for (const t of tracks) send(action.type, { track: t as unknown as RoomPayload });
    if (tracks.length) setJam({ notice: `Sent “${tracks[0]?.title}” to the Jam queue` });
    return true;
  }
  if (action.type === 'play') {
    if (action.track.source === 'local') {
      setJam({ notice: "Local files can't be shared in a Jam." });
      return true;
    }
    if (mode === 'control') {
      send('play', { track: action.track as unknown as RoomPayload });
      setJam({ notice: `Playing “${action.track.title}” for everyone` });
    } else if (mode === 'add') {
      send('add', { track: action.track as unknown as RoomPayload });
      setJam({
        notice: `Added “${action.track.title}” to the Jam queue (the host controls what plays)`,
      });
    } else {
      refuse(ONLY_HOST.listen);
    }
    return true;
  }
  if (mode !== 'control') {
    refuse(ONLY_HOST[mode]);
    return true;
  }
  send(action.type, action.type === 'seek' ? { sec: action.sec } : {});
  return true;
}

/** Join a Jam by code as a guest. `rejoining` waits longer for the host. */
export async function joinJam(rawCode: string, rejoining = false): Promise<void> {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) {
    setJam({ error: `Jam codes have ${CODE_LENGTH} letters/numbers.` });
    throw new Error('invalid code');
  }
  await leaveJam(undefined, false, false);
  setJam({
    status: 'connecting',
    role: 'guest',
    code,
    isPublic: false,
    guestMode: 'add',
    reconnecting: false,
    hostOffline: false,
    error: null,
    notice: null,
    members: [],
    upNextBy: {},
  });
  const r = openRoom(code, memberId);

  const pongs: PingSample[] = [];
  let gotState = false;
  let lastHostSeen = Date.now();
  let hostListed = true;
  let connected = true;
  const guestMembers = memberList();
  r.on('pong', (p) => {
    if (p.id !== memberId) return;
    pongs.push({ sentAt: Number(p.sentAt), hostTime: Number(p.hostTime), receivedAt: Date.now() });
  });
  r.on('state', (p) => {
    gotState = true;
    lastHostSeen = Date.now();
    if (jam().status === 'connecting') {
      setJam({ status: 'active' });
      rememberJam();
    }
    enqueueState(p as unknown as JamState);
  });
  r.on('end', () => void leaveJam('The host ended the Jam.'));
  r.on('kick', (p) => {
    if (p.id === memberId) void leaveJam('The host removed you from this Jam.', true);
  });
  r.onMembers((members: RoomMember[]) => {
    guestMembers.show(members);
    hostListed = members.some((m) => m.role === 'host');
    if (hostListed) lastHostSeen = Date.now();
  });
  r.onConnection?.((isUp) => {
    connected = isUp;
    setJam({ reconnecting: !isUp });
    if (isUp) {
      // Our own connection was down: that time doesn't count against the host.
      lastHostSeen = Date.now();
      r.send('hello', { id: memberId });
    }
  });

  try {
    await r.join({ id: memberId, name: displayName('guest'), role: 'guest', uid: myUid() });
  } catch (err) {
    setJam({ status: 'idle', role: null, code: null, error: (err as Error).message });
    throw err;
  }
  room = r;
  setRemoteHandler(guestAction);

  // Clock sync: a few pings, keep the cleanest sample.
  for (let i = 0; i < PING_COUNT; i++) {
    r.send('ping', { id: memberId, sentAt: Date.now() });
    await sleep(PING_GAP_MS);
  }
  offsetMs = clockOffset(pongs);
  r.send('hello', { id: memberId });

  const hostTimer = setTimeout(
    () => {
      if (!gotState)
        void leaveJam(
          rejoining ? `Jam ${code} has ended.` : `No Jam found with code ${code}.`,
          true,
        );
    },
    rejoining ? REJOIN_WAIT_MS : HOST_WAIT_MS,
  );
  const hostWatch = setInterval(() => {
    if (!gotState || !connected) return;
    const quiet = Date.now() - lastHostSeen;
    if (quiet > HOST_QUIET_MS && !jam().hostOffline) setJam({ hostOffline: true });
    if (quiet > HOST_GONE_MS && !hostListed) void leaveJam('The host left the Jam.');
  }, HOST_CHECK_MS);
  let beats = 0;
  const remember = setInterval(() => {
    if (++beats % 12 === 0) rememberJam();
  }, HEARTBEAT_MS);
  onForeground = () => {
    // Timers were paused in the background: don't count that time against the host.
    lastHostSeen = Date.now();
    r.ensureConnected?.();
    r.send('hello', { id: memberId });
    rememberJam();
  };
  watchAppState();
  cleanups = [
    () => clearTimeout(hostTimer),
    () => clearInterval(hostWatch),
    () => clearInterval(remember),
    guestMembers.cancel,
  ];
}

/** Guests: ask the host to add a song to the shared queue. */
export function requestQueueAdd(track: Track, playNextToo = false): void {
  if (!room) return;
  guestAction({ type: playNextToo ? 'playNext' : 'add', tracks: [track] });
}

export const isJamGuest = (): boolean => jam().role === 'guest' && jam().status !== 'idle';

/**
 * Leave (guest) or end (host) the Jam. `reason` is shown to the user.
 * A guest's player stops (the host's songs shouldn't keep playing). `forget` = false keeps
 * the "Rejoin" memory (used internally when switching Jams).
 */
export async function leaveJam(reason?: string, asError = false, forget = true): Promise<void> {
  const r = room;
  const wasGuest = jam().role === 'guest' && jam().status !== 'idle';
  room = null;
  setRemoteHandler(null);
  onForeground = null;
  for (const fn of cleanups) fn();
  cleanups = [];
  latest = null;
  offsetMs = 0;
  const endedCode = jam().role === 'host' ? jam().code : null;
  if (r) {
    if (jam().role === 'host') r.send('end', {});
    await r.leave().catch(() => {});
  }
  // (Guarded: test mocks of the engine may not provide stop.)
  if (wasGuest && typeof stop === 'function') stop();
  setJam({
    status: 'idle',
    role: null,
    code: null,
    members: [],
    upNext: [],
    upNextBy: {},
    reconnecting: false,
    hostOffline: false,
    notice: asError ? null : (reason ?? null),
    error: asError ? (reason ?? null) : null,
    ...(forget ? { lastJam: null } : {}),
  });
  syncAnnouncement();
  // Host ended the Jam: its cards in clan chats show "ended".
  if (r && endedCode) void endJamCards(endedCode).catch(() => {});
}

/** The Jam we were in before the app was closed, if it's recent enough to rejoin. */
export function rejoinableJam() {
  const s = jam();
  const last = s.lastJam;
  if (!last || s.status !== 'idle') return null;
  if (Date.now() - last.at > REJOIN_WINDOW_MS) return null;
  return last;
}

/** Rejoin it (host: host the same code again; guest: join and wait for the host). */
export async function rejoinLastJam(): Promise<void> {
  const last = rejoinableJam();
  if (!last) return;
  if (last.role === 'host') await startJam(last.isPublic, last.code, last.guestMode);
  else await joinJam(last.code, true);
}

export function forgetLastJam(): void {
  setJam({ lastJam: null });
}

/** Test-only. */
export const __jamMemberId = memberId;
