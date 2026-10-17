/**
 * Thin wrapper over Supabase Realtime (broadcast + presence) for Jam rooms.
 * Keeps supabase-js out of the rest of the app and easy to mock in tests.
 * Public channels only: no database, no auth; the anon key is public by design.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export interface RoomMember {
  id: string;
  name: string;
  role: 'host' | 'guest';
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
}

const JOIN_TIMEOUT_MS = 15_000;

export const realtimeConfigured = (): boolean => !!(env.supabaseUrl && env.supabaseAnonKey);

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!realtimeConfigured()) {
    throw new Error('Jam is not set up: add EXPO_PUBLIC_SUPABASE_URL and _ANON_KEY to .env');
  }
  client ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}

export function openRoom(code: string, memberId: string): Room {
  const sb = getClient();
  const channel: RealtimeChannel = sb.channel(`jam:${code}`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: memberId } },
  });

  return {
    on(event, handler) {
      channel.on('broadcast', { event }, (msg) => handler((msg.payload ?? {}) as RoomPayload));
    },

    onMembers(handler) {
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ id: string; name: string; role: 'host' | 'guest' }>();
        const members = Object.values(state)
          .map((metas) => metas[0])
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map(({ id, name, role }) => ({ id, name, role }));
        handler(members);
      });
    },

    join(me) {
      return new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          settled = true;
          reject(new Error('Could not connect to the Jam (timeout). Check your internet.'));
        }, JOIN_TIMEOUT_MS);
        channel.subscribe((status, err) => {
          if (settled) return;
          if (status === 'SUBSCRIBED') {
            settled = true;
            clearTimeout(timer);
            channel.track({ ...me }).then(() => resolve(), reject);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            settled = true;
            clearTimeout(timer);
            reject(new Error(`Jam connection failed (${status}${err ? `: ${err.message}` : ''})`));
          }
        });
      });
    },

    send(event, payload) {
      void channel.send({ type: 'broadcast', event, payload });
    },

    async leave() {
      try {
        await channel.untrack();
      } catch {
        // already gone
      }
      await sb.removeChannel(channel);
    },
  };
}
