/** One shared Supabase client (Jam realtime, listening history, app updates). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export const supabaseConfigured = (): boolean => !!(env.supabaseUrl && env.supabaseAnonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured()) {
    throw new Error('Supabase is not set up: add EXPO_PUBLIC_SUPABASE_URL and _ANON_KEY to .env');
  }
  client ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
