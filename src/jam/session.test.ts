import type { RoomMember, RoomPayload } from '@/lib/realtime';
import type { Track } from '@/sources/types';
import { useJamStore } from '@/store/jamStore';
import { initialPlayerState, usePlayerStore } from '@/store/playerStore';

// ---- In-memory realtime hub: rooms by code, broadcasts go to everyone else ----

type Handler = (p: RoomPayload) => void;
interface FakeMember {
  id: string;
  me?: RoomMember;
  handlers: Record<string, Handler[]>;
  membersHandler?: (m: RoomMember[]) => void;
}
const mockRooms = new Map<string, FakeMember[]>();
const mockSent: { code: string; event: string; payload: RoomPayload }[] = [];

function mockMembersOf(code: string) {
  return (mockRooms.get(code) ?? []).filter((m) => m.me).map((m) => m.me!);
}
function mockNotify(code: string) {
  for (const m of mockRooms.get(code) ?? []) m.membersHandler?.(mockMembersOf(code));
}
function mockDeliver(code: string, fromId: string, event: string, payload: RoomPayload) {
  for (const m of mockRooms.get(code) ?? []) {
    if (m.id === fromId) continue;
    for (const h of m.handlers[event] ?? []) h(JSON.parse(JSON.stringify(payload)));
  }
}

jest.mock('@/lib/realtime', () => ({
  realtimeConfigured: () => true,
  openRoom: (code: string, id: string) => {
    const member: FakeMember = { id, handlers: {} };
    return {
      on: (event: string, h: Handler) => (member.handlers[event] ??= []).push(h),
      onMembers: (h: (m: RoomMember[]) => void) => (member.membersHandler = h),
      join: async (me: RoomMember) => {
        member.me = me;
        mockRooms.set(code, [...(mockRooms.get(code) ?? []), member]);
        mockNotify(code);
      },
      send: (event: string, payload: RoomPayload) => {
        mockSent.push({ code, event, payload });
        mockDeliver(code, id, event, payload);
      },
      leave: async () => {
        mockRooms.set(code, (mockRooms.get(code) ?? []).filter((m) => m !== member));
        mockNotify(code);
      },
    };
  },
}));

// ---- Player engine mock: updates the player store like the real one ----

const mockEngine = {
  playQueue: jest.fn(async (tracks: Track[], start = 0) => {
    usePlayerStore.setState({
      queue: { tracks, index: start },
      status: 'playing',
      positionSec: 0,
    });
  }),
  pause: jest.fn(() => usePlayerStore.setState({ status: 'paused' })),
  resume: jest.fn(() => usePlayerStore.setState({ status: 'playing' })),
  seek: jest.fn(async (sec: number) => usePlayerStore.setState({ positionSec: sec })),
  addToQueue: jest.fn(async (tracks: Track[]) => {
    const q = usePlayerStore.getState().queue;
    usePlayerStore.setState({ queue: { ...q, tracks: [...q.tracks, ...tracks] } });
  }),
};
jest.mock('@/player/engine', () => ({
  playQueue: (...a: [Track[], number?]) => mockEngine.playQueue(...a),
  pause: () => mockEngine.pause(),
  resume: () => mockEngine.resume(),
  seek: (s: number) => mockEngine.seek(s),
  addToQueue: (t: Track[]) => mockEngine.addToQueue(t),
}));

// eslint-disable-next-line import/first
import { __jamMemberId, applyState, joinJam, leaveJam, requestQueueAdd, startJam } from './session';

const t = (n: number, source: Track['source'] = 'youtube'): Track => ({
  id: `${source}:${n}`,
  title: `Song ${n}`,
  artist: 'A',
  durationSec: 200,
  source,
});

/** A fake remote participant in a room. */
function remote(code: string, role: 'host' | 'guest', name: string = role) {
  const member: FakeMember = { id: `remote-${role}`, handlers: {} };
  member.me = { id: member.id, name, role };
  mockRooms.set(code, [...(mockRooms.get(code) ?? []), member]);
  mockNotify(code);
  return {
    on: (event: string, h: Handler) => (member.handlers[event] ??= []).push(h),
    send: (event: string, payload: RoomPayload) => mockDeliver(code, member.id, event, payload),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  jest.useRealTimers();
  await leaveJam();
  mockRooms.clear();
  mockSent.length = 0;
  Object.values(mockEngine).forEach((f) => f.mockClear());
  usePlayerStore.setState({ ...initialPlayerState });
  useJamStore.setState({ status: 'idle', role: null, code: null, members: [], notice: null, error: null, myName: 'Dev' });
});

afterAll(() => leaveJam());

describe('jam host', () => {
  it('starts a room and broadcasts player changes', async () => {
    const code = await startJam();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(useJamStore.getState()).toMatchObject({ status: 'active', role: 'host' });

    const guest = remote(code, 'guest', 'Riya');
    const states: RoomPayload[] = [];
    guest.on('state', (p) => states.push(p));
    usePlayerStore.setState({ queue: { tracks: [t(1), t(2)], index: 0 }, status: 'playing' });

    expect(states.at(-1)).toMatchObject({ track: { id: 'youtube:1' }, playing: true, upNext: [{ id: 'youtube:2' }] });
    expect(useJamStore.getState().members.map((m) => m.name)).toEqual(['Dev', 'Riya']);
  });

  it('answers pings and adds guest suggestions to the queue', async () => {
    const code = await startJam();
    usePlayerStore.setState({ queue: { tracks: [t(1)], index: 0 }, status: 'playing' });
    const guest = remote(code, 'guest', 'Riya');
    const pongs: RoomPayload[] = [];
    guest.on('pong', (p) => pongs.push(p));

    guest.send('ping', { id: 'remote-guest', sentAt: 123 });
    expect(pongs[0]).toMatchObject({ id: 'remote-guest', sentAt: 123 });

    guest.send('queue-add', { track: t(9) as unknown as RoomPayload, by: 'Riya' });
    await flush();
    expect(mockEngine.addToQueue).toHaveBeenCalledWith([expect.objectContaining({ id: 'youtube:9' })]);
    expect(useJamStore.getState().notice).toBe('Riya added Song 9');
  });

  it('tells everyone when the Jam ends', async () => {
    const code = await startJam();
    const guest = remote(code, 'guest');
    const ended = jest.fn();
    guest.on('end', ended);
    await leaveJam();
    expect(ended).toHaveBeenCalled();
    expect(useJamStore.getState().status).toBe('idle');
  });
});

describe('jam guest', () => {
  it('rejects malformed codes', async () => {
    await expect(joinJam('AB')).rejects.toThrow();
    expect(useJamStore.getState().error).toMatch(/6/);
  });

  it('joins, syncs clocks and follows the host', async () => {
    const host = remote('ABCDEF', 'host', 'Dev');
    host.on('ping', (p) => host.send('pong', { id: p.id, sentAt: p.sentAt, hostTime: Date.now() }));
    let helloFrom: unknown = null;
    host.on('hello', (p) => (helloFrom = p.id));

    await joinJam('abcdef');
    expect(helloFrom).toBe(__jamMemberId);

    host.send('state', {
      track: t(1) as unknown as RoomPayload,
      positionSec: 40,
      playing: true,
      sentAt: Date.now(),
      upNext: [t(2)] as unknown as RoomPayload,
    });
    await flush();
    await flush();
    expect(mockEngine.playQueue).toHaveBeenCalledWith([expect.objectContaining({ id: 'youtube:1' }), expect.objectContaining({ id: 'youtube:2' })], 0);
    expect(usePlayerStore.getState().positionSec).toBeGreaterThanOrEqual(40);
    expect(useJamStore.getState().status).toBe('active');
  }, 10_000);

  it('stays in the Jam when presence briefly misses the host (someone else joining)', async () => {
    jest.useFakeTimers();
    const host = remote('ABCDEF', 'host', 'Dev');
    host.on('ping', (p) => host.send('pong', { id: p.id, sentAt: p.sentAt, hostTime: Date.now() }));
    const joining = joinJam('abcdef');
    await jest.advanceTimersByTimeAsync(1_000);
    await joining;
    const sendState = () =>
      host.send('state', { track: null, positionSec: 0, playing: false, sentAt: Date.now(), upNext: [] });
    sendState();
    await jest.advanceTimersByTimeAsync(0);

    // A second guest joins; one presence update arrives without the host.
    const me = (mockRooms.get('ABCDEF') ?? []).find((m) => m.id === __jamMemberId);
    remote('ABCDEF', 'guest', 'Riya');
    me?.membersHandler?.(mockMembersOf('ABCDEF').filter((m) => m.role !== 'host'));
    expect(useJamStore.getState().members.map((m) => m.name)).toEqual(expect.arrayContaining(['Dev', 'Riya']));

    // Host keeps its heartbeat: nobody gets kicked, the list settles back.
    for (let i = 0; i < 6; i++) {
      await jest.advanceTimersByTimeAsync(5_000);
      sendState();
    }
    expect(useJamStore.getState().status).toBe('active');

    // Host really gone: missing from presence and silent for 15 s → leave.
    await jest.advanceTimersByTimeAsync(17_000);
    expect(useJamStore.getState().status).toBe('idle');
    expect(useJamStore.getState().notice).toBe('The host left the Jam.');
    jest.useRealTimers();
  });

  it('pauses with the host and re-seeks on drift', async () => {
    usePlayerStore.setState({ queue: { tracks: [t(1)], index: 0 }, status: 'playing', positionSec: 10 });
    await applyState({ track: t(1), positionSec: 50, playing: false, sentAt: Date.now(), upNext: [] });
    expect(mockEngine.pause).toHaveBeenCalled();
    expect(mockEngine.seek).toHaveBeenCalledWith(50);
    expect(mockEngine.playQueue).not.toHaveBeenCalled();
  });

  it('skips local files the host plays', async () => {
    usePlayerStore.setState({ queue: { tracks: [t(1)], index: 0 }, status: 'playing' });
    await applyState({ track: t(5, 'local'), positionSec: 0, playing: true, sentAt: Date.now(), upNext: [] });
    expect(mockEngine.playQueue).not.toHaveBeenCalled();
    expect(useJamStore.getState().notice).toMatch(/local file/);
  });

  it('sends queue suggestions to the host', async () => {
    const host = remote('ZZZZZZ', 'host');
    const adds: RoomPayload[] = [];
    host.on('queue-add', (p) => adds.push(p));
    host.on('ping', (p) => host.send('pong', { id: p.id, sentAt: p.sentAt, hostTime: Date.now() }));
    await joinJam('ZZZZZZ');
    requestQueueAdd(t(7));
    expect(adds[0]).toMatchObject({ track: { id: 'youtube:7' }, by: 'Dev' });
  }, 10_000);
});
