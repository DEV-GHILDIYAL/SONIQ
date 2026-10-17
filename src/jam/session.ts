/**
 * Jam (listen together) session. One Jam at a time.
 *
 * Host: broadcasts its player state on every play/pause/seek/track change and every 5 s.
 * Guest: follows that state through the player engine (loads the same track itself,
 * seeks to the host's position corrected for clock offset and elapsed time).
 * Guests can't control playback; they can send songs to the host's queue.
 * Transport: src/lib/realtime.ts (Supabase Realtime broadcast + presence).
 */
import { openRoom, type Room, type RoomMember, type RoomPayload } from '@/lib/realtime';
import { addToQueue, pause, playQueue, resume, seek } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import type { Track } from '@/sources/types';
import { useJamStore } from '@/store/jamStore';
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
/** Position jumps larger than this between two player updates are treated as seeks. */
const SEEK_JUMP_SEC = 2;
const UP_NEXT_COUNT = 10;
/** A guest leaves only if the host sent nothing for this long AND is missing from presence. */
const HOST_GONE_MS = 15_000;
const HOST_CHECK_MS = 2_000;
/** Presence can briefly drop members while someone joins; keep them listed this long. */
const MEMBER_DROP_GRACE_MS = 4_000;

const memberId = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

let room: Room | null = null;
let cleanups: (() => void)[] = [];
let offsetMs = 0;

const setJam = useJamStore.setState;

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
    const shown = useJamStore.getState().members;
    const missing = shown.filter((s) => !members.some((m) => m.id === s.id));
    if (missing.length === 0) {
      setJam({ members });
      return;
    }
    setJam({ members: [...members, ...missing] });
    timer = setTimeout(() => {
      timer = null;
      if (useJamStore.getState().status !== 'idle') setJam({ members });
    }, MEMBER_DROP_GRACE_MS);
  };
  return { show, cancel };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const displayName = (role: 'host' | 'guest') =>
  useProfileStore.getState().profile?.name.trim() ||
  useJamStore.getState().myName.trim() ||
  (role === 'host' ? 'Host' : 'Listener');

// ---- Host ----

function playerSnapshot(): JamState {
  const s = usePlayerStore.getState();
  const q = s.queue;
  return {
    track: currentTrack(q) ?? null,
    positionSec: s.positionSec,
    playing: s.status === 'playing' || s.status === 'loading',
    sentAt: Date.now(),
    upNext: q.index >= 0 ? q.tracks.slice(q.index + 1, q.index + 1 + UP_NEXT_COUNT) : [],
  };
}

function broadcastState(): void {
  if (!room) return;
  const state = playerSnapshot();
  room.send('state', state as unknown as RoomPayload);
  setJam({
    upNext: state.upNext,
    notice:
      state.track?.source === 'local'
        ? "Local files can't be shared in a Jam. Friends will skip this song."
        : useJamStore.getState().notice,
  });
}

/** Start a Jam as host. Resolves with the room code. */
export async function startJam(): Promise<string> {
  await leaveJam();
  const code = makeJamCode();
  setJam({ status: 'connecting', role: 'host', code, error: null, notice: null, members: [] });
  const r = openRoom(code, memberId);

  r.on('ping', (p) => r.send('pong', { id: p.id, sentAt: p.sentAt, hostTime: Date.now() }));
  r.on('hello', () => broadcastState());
  r.on('queue-add', (p) => {
    const track = p.track as Track | undefined;
    if (!track?.id) return;
    void addToQueue([track]).then(broadcastState);
    setJam({ notice: `${String(p.by ?? 'A friend')} added ${track.title}` });
  });
  const hostMembers = memberList();
  r.onMembers(hostMembers.show);

  try {
    await r.join({ id: memberId, name: displayName('host'), role: 'host' });
  } catch (err) {
    setJam({ status: 'idle', role: null, code: null, error: (err as Error).message });
    throw err;
  }
  room = r;

  // Broadcast on anything a listener would notice.
  const unsubscribe = usePlayerStore.subscribe((s, prev) => {
    const trackChanged = currentTrack(s.queue)?.id !== currentTrack(prev.queue)?.id;
    const statusChanged = s.status !== prev.status;
    const seeked = Math.abs(s.positionSec - prev.positionSec) > SEEK_JUMP_SEC;
    const queueChanged = s.queue.tracks !== prev.queue.tracks;
    if (trackChanged || statusChanged || seeked || queueChanged) broadcastState();
  });
  const heartbeat = setInterval(broadcastState, HEARTBEAT_MS);
  cleanups = [unsubscribe, () => clearInterval(heartbeat), hostMembers.cancel];

  setJam({ status: 'active' });
  broadcastState();
  return code;
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
  setJam({ upNext: state.upNext });
  const player = usePlayerStore.getState();
  const local = currentTrack(player.queue);

  if (!state.track) {
    if (player.status === 'playing') pause();
    return;
  }
  if (state.track.source === 'local') {
    if (player.status === 'playing') pause();
    setJam({ notice: 'The host is playing a local file, which can’t be shared.' });
    return;
  }

  if (local?.id !== state.track.id) {
    // Load the host's track (plus what's next), then jump to where the host is now.
    await playQueue([state.track, ...state.upNext.filter((t) => t.source !== 'local')], 0);
    if (!state.playing) pause();
    else await seek(expectedPosition(state, hostNow()));
    return;
  }

  const now = usePlayerStore.getState();
  if (now.status === 'loading' || now.status === 'error') return;
  if (!state.playing) {
    if (now.status === 'playing') pause();
    if (needsSeek(now.positionSec, state.positionSec)) await seek(state.positionSec);
    return;
  }
  if (now.status === 'paused' || now.status === 'idle') resume();
  const expected = expectedPosition(state, hostNow());
  if (needsSeek(now.positionSec, expected)) await seek(expected);
}

/** Join a Jam by code as a guest. */
export async function joinJam(rawCode: string): Promise<void> {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) {
    setJam({ error: `Jam codes have ${CODE_LENGTH} letters/numbers.` });
    throw new Error('invalid code');
  }
  await leaveJam();
  setJam({ status: 'connecting', role: 'guest', code, error: null, notice: null, members: [] });
  const r = openRoom(code, memberId);

  const pongs: PingSample[] = [];
  let gotState = false;
  let lastHostSeen = Date.now();
  let hostListed = true;
  const guestMembers = memberList();
  r.on('pong', (p) => {
    if (p.id !== memberId) return;
    pongs.push({ sentAt: Number(p.sentAt), hostTime: Number(p.hostTime), receivedAt: Date.now() });
  });
  r.on('state', (p) => {
    gotState = true;
    lastHostSeen = Date.now();
    if (useJamStore.getState().status === 'connecting') setJam({ status: 'active' });
    enqueueState(p as unknown as JamState);
  });
  r.on('end', () => void leaveJam('The host ended the Jam.'));
  r.onMembers((members: RoomMember[]) => {
    guestMembers.show(members);
    // Don't leave on one presence update: it can briefly miss the host while someone joins.
    hostListed = members.some((m) => m.role === 'host');
    if (hostListed) lastHostSeen = Date.now();
  });

  try {
    await r.join({ id: memberId, name: displayName('guest'), role: 'guest' });
  } catch (err) {
    setJam({ status: 'idle', role: null, code: null, error: (err as Error).message });
    throw err;
  }
  room = r;

  // Clock sync: a few pings, keep the cleanest sample.
  for (let i = 0; i < PING_COUNT; i++) {
    r.send('ping', { id: memberId, sentAt: Date.now() });
    await sleep(PING_GAP_MS);
  }
  offsetMs = clockOffset(pongs);
  r.send('hello', { id: memberId });

  const hostTimer = setTimeout(() => {
    if (!gotState) void leaveJam(`No Jam found with code ${code}.`, true);
  }, HOST_WAIT_MS);
  const hostWatch = setInterval(() => {
    if (gotState && !hostListed && Date.now() - lastHostSeen > HOST_GONE_MS)
      void leaveJam('The host left the Jam.');
  }, HOST_CHECK_MS);
  cleanups = [() => clearTimeout(hostTimer), () => clearInterval(hostWatch), guestMembers.cancel];
}

/** Guests: ask the host to add a song to the shared queue. */
export function requestQueueAdd(track: Track): void {
  if (!room) return;
  if (track.source === 'local') {
    setJam({ notice: "Local files can't be shared in a Jam." });
    return;
  }
  room.send('queue-add', { track: track as unknown as RoomPayload, by: displayName('guest') });
  setJam({ notice: `Sent “${track.title}” to the host’s queue` });
}

export const isJamGuest = (): boolean =>
  useJamStore.getState().role === 'guest' && useJamStore.getState().status !== 'idle';

/** Leave (guest) or end (host) the Jam. `reason` is shown to the user. */
export async function leaveJam(reason?: string, asError = false): Promise<void> {
  const r = room;
  room = null;
  for (const fn of cleanups) fn();
  cleanups = [];
  latest = null;
  offsetMs = 0;
  if (r) {
    if (useJamStore.getState().role === 'host') r.send('end', {});
    await r.leave().catch(() => {});
  }
  setJam({
    status: 'idle',
    role: null,
    code: null,
    members: [],
    upNext: [],
    notice: asError ? null : (reason ?? null),
    error: asError ? (reason ?? null) : null,
  });
}

/** Test-only. */
export const __jamMemberId = memberId;
