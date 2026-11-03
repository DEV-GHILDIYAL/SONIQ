/**
 * Linked devices: one SONIQ account on the phone and the laptop at the same time.
 * The signed-in device makes a one-time code (10 min); the new device claims it
 * (cloudBackup.linkThisDevice). Server: soniq_link_start / devices_list / device_remove.
 */
import { useProfileStore } from '@/store/profileStore';
import { getSupabase, supabaseConfigured } from './supabase';

export interface LinkedDevice {
  key: string;
  name: string;
  created_at: string;
  last_seen: string;
  /** This device (the caller). */
  this: boolean;
}

function readable(message: string): string {
  if (/device limit/i.test(message)) return 'You can link up to 5 devices. Remove one first.';
  if (/expired/i.test(message)) return 'That QR code expired. Make a new one on the PC.';
  if (/could not find the function|soniq_link|soniq_devices/i.test(message))
    return 'Linking needs a server update. Ask the SONIQ admin to run the latest setup.sql.';
  if (/network|fetch|timeout/i.test(message)) return 'No internet. Try again.';
  return message;
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const profile = useProfileStore.getState().profile;
  if (!profile || !supabaseConfigured()) throw new Error('Create your account first.');
  const { data, error } = await getSupabase().rpc(fn, {
    p_id: profile.id,
    p_secret: profile.secret,
    ...args,
  });
  if (error) throw new Error(readable(error.message));
  return data as T;
}

/** A fresh 8-letter link code, valid for 10 minutes (older codes stop working). */
export function startLink(): Promise<string> {
  return call<string>('soniq_link_start');
}

export function listDevices(): Promise<LinkedDevice[]> {
  return call<LinkedDevice[]>('soniq_devices_list').then((d) => d ?? []);
}

export function removeDevice(key: string): Promise<void> {
  return call<void>('soniq_device_remove', { p_key: key });
}

/** "ABCDEFGH" -> "ABCD EFGH" for reading out. */
export function formatLinkCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

/** Deep link inside the pairing QR. */
export function pairLink(token: string): string {
  return `soniq://pair/${token}`;
}

/** Token from a scanned QR (link or bare token), or null if it isn't a SONIQ pairing QR. */
export function parsePairToken(scanned: string): string | null {
  const m = /^(?:soniq:\/\/pair\/)?([a-f0-9]{32})$/i.exec(scanned.trim());
  return m ? (m[1] as string).toLowerCase() : null;
}

/** Signed-in phone: link the PC that shows this QR. Returns the PC's name. */
export function approvePairing(token: string): Promise<string> {
  return call<string>('soniq_pair_approve', { p_token: token });
}
