// SONIQ one-tap restore link.
// https://<project>.supabase.co/functions/v1/restore?id=SQ-XXXX-XXXX&code=XXXX-XXXX-XXXX-XXXX
// → 302 redirect that opens the app (soniq://restore?...), where the user confirms.
// Deploy with JWT verification OFF (the link is opened by a plain browser).
// It never touches the database; the app does the actual restore.

const ID = /^SQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const CODE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/;
const PACKAGE = 'com.anonymous.soniq';

Deno.serve((req) => {
  const url = new URL(req.url);
  const id = (url.searchParams.get('id') ?? '').toUpperCase();
  const code = (url.searchParams.get('code') ?? '').toUpperCase();
  if (!ID.test(id) || !CODE.test(code)) {
    return new Response('This SONIQ restore link is incomplete. Copy it again from Profile > Account backup.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const query = `id=${encodeURIComponent(id)}&code=${encodeURIComponent(code)}`;
  // Android intent URL: Chrome / in-app browsers hand it straight to the SONIQ app.
  const location = `intent://restore?${query}#Intent;scheme=soniq;package=${PACKAGE};end`;
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
});
