// SONIQ invite links (friend + Jam).
// https://<project>.supabase.co/functions/v1/invite?id=SQ-XXXX-XXXX&name=Dev  → soniq://friend?...
// https://<project>.supabase.co/functions/v1/invite?jam=ABC123               → soniq://jam?code=ABC123
// https://<project>.supabase.co/functions/v1/invite?clan=ABCD2345            → soniq://clan-join?code=ABCD2345
// 302 redirect that opens the app, where the user confirms.
// Deploy with JWT verification OFF (the link is opened by a plain browser).
// It never touches the database.
const ID = /^SQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const JAM = /^[A-Z0-9]{6}$/;
const CLAN = /^[A-Z0-9]{8}$/;
const PACKAGE = 'com.anonymous.soniq';

const open = (path: string) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: `intent://${path}#Intent;scheme=soniq;package=${PACKAGE};end`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });

Deno.serve((req) => {
  const url = new URL(req.url);
  const jam = (url.searchParams.get('jam') ?? '').toUpperCase();
  if (JAM.test(jam)) return open(`jam?code=${jam}`);
  const clan = (url.searchParams.get('clan') ?? '').toUpperCase();
  if (CLAN.test(clan)) return open(`clan-join?code=${clan}`);

  const id = (url.searchParams.get('id') ?? '').toUpperCase();
  const name = (url.searchParams.get('name') ?? '').slice(0, 24);
  if (ID.test(id)) return open(`friend?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`);

  return new Response('This SONIQ link is incomplete. Ask your friend to share it again.', {
    status: 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
});
