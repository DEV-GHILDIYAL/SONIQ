// SONIQ profile photo upload. The app can't write to Storage directly anymore: it asks this
// function, which checks the SONIQ ID + device secret and returns a one-time signed upload
// URL for that user's own file (<id>/avatar.<ext>) only. Bucket limits: images, max 2 MB.
//
// Deploy with JWT verification ON (the default): npx supabase functions deploy avatar
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);
const ID = /^SQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad request' });
  }
  const id = typeof body.id === 'string' ? body.id.toUpperCase() : '';
  const secret = typeof body.secret === 'string' ? body.secret : '';
  const ext = typeof body.ext === 'string' ? body.ext.toLowerCase() : '';
  if (!ID.test(id) || !secret || !EXT.has(ext)) return json(400, { error: 'bad request' });

  const { data: ok, error } = await db.rpc('soniq_verify', { p_id: id, p_secret: secret });
  if (error) return json(500, { error: 'server error' });
  if (!ok) return json(401, { error: 'not allowed' });

  const path = `${id}/avatar.${ext}`;
  const { data, error: signError } = await db.storage
    .from('avatars')
    .createSignedUploadUrl(path, { upsert: true });
  if (signError || !data) return json(500, { error: 'server error' });
  return json(200, { path: data.path, token: data.token });
});
