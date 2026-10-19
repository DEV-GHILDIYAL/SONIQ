/**
 * One-tap restore link, served by the Supabase Edge Function `restore`
 * (supabase/functions/restore). Chat apps only make https:// links tappable, so the link
 * points there and the function redirects into the app (soniq://restore?id=…&code=…).
 */
import { env } from './env';

export function restoreLink(id: string, code: string): string {
  const base = env.supabaseUrl.replace(/\/+$/, '');
  return `${base}/functions/v1/restore?id=${encodeURIComponent(id)}&code=${encodeURIComponent(code)}`;
}
