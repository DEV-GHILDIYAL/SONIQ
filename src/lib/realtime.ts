/**
 * Thin wrapper over Supabase Realtime (broadcast + presence) for Jam rooms.
 * Keeps supabase-js out of the rest of the app and easy to mock in tests.
 * Public channels only: no database, no auth; the anon key is public by design.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, supabaseConfigured } from '@/lib/supabase';

export interface RoomMember {
  id: string;
  name: string;
  role: 'host' | 'guest';
  /** SONIQ profile ID (lets the host keep a removed person out). */
  uid?: string;
}

/** Payloads are plain JSON objects. */
export type RoomPayload = Record<string, unknown>;

export interface Room {
  /** Listen to a broadcast event. Register before join(). */
  on(event: string, handler: (payload: RoomPayload) => void): void;
  /** Called with the full member list whenever presence changes. Register before join(). */
  onMembers(handler: (members: RoomMember[]) => void): void;
  /** Connect and announce `me` to the room. */
  join(me: RoomMember): Promise<void>;
  /** Send to everyone else in the room. */
  send(event: string, payload: RoomPayload): void;
  leave(): Promise<void>;
  /** After join: called with false when the connection drops and true when it's back. */
  onConnection?(handler: (connected: boolean) => void): void;
  /** After join: reconnect now if the connection died (e.g. app back from background). */
  ensureConnected?(): void;
}

const JOIN_TIMEOUT_MS = 15_000;

export const realtimeConfigured = supabaseConfigured;

const getClient = getSupabase;

/** Reconnect delays after the connection drops (ms); the last one repeats. */
const RETRY_MS = [2_000, 5_000, 10_000, 20_000];

export function openRoom(code: string, memberId: string): Room {
  const sb = getClient();
  const events: { event: string; handler: (payload: RoomPayload) => void }[] = [];
  let membersHandler: ((members: RoomMember[]) => void) | null = null;
  let connectionHandler: ((connected: boolean) => void) | null = null;
  let me: RoomMember | null = null;
  let joined = false;
  let leaving = false;
  let connected = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const build = (): RealtimeChannel => {
    const ch = sb.channel(`jam:${code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: memberId } },
    });
    for (const { event, handler } of events) {
      ch.on('broadcast', { event }, (msg) => handler((msg.payload ?? {}) as RoomPayload));
    }
    ch.on('presence', { event: 'sync' }, () => {
      if (!membersHandler) return;
      const state = ch.presenceState<{
        id: string;
        name: string;
        role: 'host' | 'guest';
        uid?: string;
      }>();
      const members = Object.values(state)
        .map((metas) => metas[0])
        .filter((m): m is NonNullable<typeof m> => !!m)
        .map(({ id, name, role, uid }) => ({ id, name, role, uid }));
      membersHandler(members);
    });
    return ch;
  };

  let channel: RealtimeChannel = build();

  const setConnected = (value: boolean) => {
    if (connected === value) return;
    connected = value;
    connectionHandler?.(value);
  };

  /** Throw the dead channel away and join a fresh one (keeps all handlers). */
  const rebuild = () => {
    if (leaving || !joined) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (!sb.realtime.isConnected()) sb.realtime.connect();
    const old = channel;
    channel = build();
    void sb.removeChannel(old);
    subscribe(channel);
  };

  const scheduleRetry = () => {
    if (leaving || retryTimer) return;
    const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)] ?? 20_000;
    attempt++;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (channel.state !== 'joined') rebuild();
    }, delay);
  };

  /** Status updates for the life of the channel (Supabase also retries on its own). */
  const subscribe = (
    ch: RealtimeChannel,
    first?: { resolve: () => void; reject: (e: Error) => void },
  ) => {
    let settled = !first;
    const timer = first
      ? setTimeout(() => {
          settled = true;
          first.reject(new Error('Could not connect to the Jam (timeout). Check your internet.'));
        }, JOIN_TIMEOUT_MS)
      : null;
    ch.subscribe((status, err) => {
      if (ch !== channel || leaving) return;
      if (status === 'SUBSCRIBED') {
        attempt = 0;
        // Presence is per connection: announce ourselves again after every (re)join.
        const tracking = me ? ch.track({ ...me }) : Promise.resolve();
        if (!settled && first) {
          settled = true;
          if (timer) clearTimeout(timer);
          tracking.then(() => {
            joined = true;
            connected = true;
            first.resolve();
          }, first.reject);
        } else {
          void tracking.catch(() => {});
          setConnected(true);
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (!settled && first) {
          settled = true;
          if (timer) clearTimeout(timer);
          first.reject(
            new Error(`Jam connection failed (${status}${err ? `: ${err.message}` : ''})`),
          );
          return;
        }
        setConnected(false);
        scheduleRetry();
      }
    });
  };

  return {
    on(event, handler) {
      events.push({ event, handler });
      channel.on('broadcast', { event }, (msg) => handler((msg.payload ?? {}) as RoomPayload));
    },

    onMembers(handler) {
      membersHandler = handler;
    },

    onConnection(handler) {
      connectionHandler = handler;
    },

    join(who) {
      me = who;
      return new Promise<void>((resolve, reject) => subscribe(channel, { resolve, reject }));
    },

    send(event, payload) {
      void channel.send({ type: 'broadcast', event, payload });
    },

    ensureConnected() {
      if (leaving || !joined) return;
      if (channel.state === 'joined' && sb.realtime.isConnected()) return;
      setConnected(false);
      attempt = 0;
      rebuild();
    },

    async leave() {
      leaving = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      try {
        await channel.untrack();
      } catch {
        // already gone
      }
      await sb.removeChannel(channel);
    },
  };
}
