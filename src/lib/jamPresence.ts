/**
 * Tells the server about a PUBLIC Jam so friends can see it and join (table `jams`).
 * Private Jams are never sent. Rows expire on the server after 90 s without a refresh.
 */
import { useProfileStore } from '@/store/profileStore';
import { pingAllFriends } from './friends';
import { getSupabase, supabaseConfigured } from './supabase';

export interface JamAnnouncement {
  code: string;
  host: boolean;
  title: string | null;
  artist: string | null;
  members: number;
}

let announced = false;

/** Publish (or refresh) this listener's public Jam. Errors are ignored (best effort). */
export async function announceJam(a: JamAnnouncement): Promise<void> {
  const profile = useProfileStore.getState().profile;
  if (!profile || !supabaseConfigured()) return;
  const { error } = await getSupabase().rpc('soniq_jam_announce', {
    p_id: profile.id,
    p_secret: profile.secret,
    p_code: a.code,
    p_host: a.host,
    p_title: a.title,
    p_artist: a.artist,
    p_members: a.members,
  });
  if (error) {
    console.warn('[jam] announce failed:', error.message);
    return;
  }
  if (!announced) {
    announced = true;
    pingAllFriends();
  }
}

/** Remove the public Jam (ended, left, or switched to private). */
export async function endJamAnnouncement(): Promise<void> {
  const profile = useProfileStore.getState().profile;
  if (!announced || !profile || !supabaseConfigured()) return;
  announced = false;
  const { error } = await getSupabase().rpc('soniq_jam_end', { p_id: profile.id, p_secret: profile.secret });
  if (error) console.warn('[jam] end announce failed:', error.message);
  pingAllFriends();
}
