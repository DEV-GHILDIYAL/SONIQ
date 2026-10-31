// SONIQ AI proxy: the app sends a prompt, this function calls Groq with the key kept in
// Supabase secrets (GROQ_API_KEY). The key is never inside the app.
// Every call is checked (SONIQ ID + device secret) and counted against a daily per-user limit.
//
// Deploy with JWT verification ON (the default): the app calls it with the anon key.
//   npx supabase secrets set GROQ_API_KEY=gsk_...
//   npx supabase functions deploy ai
import { createClient } from 'npm:@supabase/supabase-js@2';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq retires models every few months. Change without a code edit:
//   npx supabase secrets set GROQ_MODEL=<model id from console.groq.com/docs/models>
const MODEL = Deno.env.get('GROQ_MODEL') ?? 'openai/gpt-oss-120b';
// gpt-oss models think before answering; those tokens count against max_tokens.
const REASONING = MODEL.startsWith('openai/gpt-oss');
const REASONING_HEADROOM = 1_024;
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '80');
const MAX_SYSTEM = 2_000;
const MAX_USER = 6_000;
const MAX_TOKENS = 1_600;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) return json(503, { error: 'ai not configured' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad request' });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const secret = typeof body.secret === 'string' ? body.secret : '';
  const system = typeof body.system === 'string' ? body.system : '';
  const user = typeof body.user === 'string' ? body.user : '';
  if (!id || !secret || !system || !user || system.length > MAX_SYSTEM || user.length > MAX_USER) {
    return json(400, { error: 'bad request' });
  }
  const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 400, 50), MAX_TOKENS);
  const temperature = Math.min(Math.max(Number(body.temperature) || 0.8, 0), 1.2);

  // Who is asking, and do they have calls left today?
  const { data: left, error } = await db.rpc('soniq_ai_take', {
    p_id: id,
    p_secret: secret,
    p_limit: DAILY_LIMIT,
  });
  if (error) {
    if (/ai limit/i.test(error.message)) return json(429, { error: 'daily limit' });
    if (/not allowed/i.test(error.message)) return json(401, { error: 'not allowed' });
    return json(500, { error: 'server error' });
  }

  const groq = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: maxTokens + (REASONING ? REASONING_HEADROOM : 0),
      ...(REASONING ? { reasoning_effort: 'low' } : {}),
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!groq) {
    console.error('[ai] groq timeout');
    return json(504, { error: 'ai timeout' });
  }
  if (!groq.ok) {
    // Shows up in Dashboard > Edge Functions > ai > Logs (never includes the key).
    console.error('[ai] groq', groq.status, (await groq.text().catch(() => '')).slice(0, 300));
    return json(groq.status === 429 ? 503 : 502, { error: 'ai unavailable' });
  }
  const data = (await groq.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const content = data?.choices?.[0]?.message?.content ?? '';
  return json(200, { content, left });
});
