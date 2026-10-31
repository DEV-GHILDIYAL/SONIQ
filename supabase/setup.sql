-- SONIQ backend (Supabase). Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run again.
--
-- Security model: the app's public (anon) key can NOT read or change any table directly.
-- It can only call the functions below, which check a per-device secret and limit how
-- much one user can send. Nobody (even with the key from the APK) can read others' data.

-- ---------- Tables ----------
create table if not exists public.profiles (
  id text primary key,                       -- SQ-XXXX-XXXX shown in Profile
  name text not null,
  secret_hash text,                          -- sha256 of the device's private secret
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plays (
  id bigint generated always as identity primary key,
  user_id text not null references public.profiles(id) on delete cascade,
  track_id text not null,
  title text not null,
  artist text not null,
  source text not null,
  genre text,
  duration_sec int,
  listened_sec int not null default 0,       -- seconds actually listened
  played_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);
-- Upgrade tables created by an older version of this script.
alter table public.profiles add column if not exists secret_hash text;
alter table public.profiles add column if not exists recovery_hash text;   -- sha256 of the backup code
alter table public.plays add column if not exists listened_sec int not null default 0;
alter table public.plays add column if not exists received_at timestamptz not null default now();

create index if not exists plays_user_time on public.plays (user_id, played_at desc);
create index if not exists plays_user_received on public.plays (user_id, received_at desc);

-- Cloud backup of liked songs, playlists, recent searches, settings (one JSON per user)
create table if not exists public.user_library (
  user_id text primary key references public.profiles(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Feature requests / feedback from the in-app form
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id text references public.profiles(id) on delete set null,
  name text,
  category text not null,
  message text not null,
  app_version text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_releases (
  version text primary key,                  -- e.g. '1.2.0' (must match app.json "version")
  notes text not null default '',
  apk_url text not null,
  created_at timestamptz not null default now()
);

-- ---------- Lock everything down ----------
alter table public.profiles enable row level security;
alter table public.plays enable row level security;
alter table public.app_releases enable row level security;
alter table public.user_library enable row level security;
alter table public.feedback enable row level security;
-- Remove the open policies from the old version of this script.
drop policy if exists "app upserts profiles" on public.profiles;
drop policy if exists "app adds plays" on public.plays;
drop policy if exists "app reads plays" on public.plays;
-- No policies on profiles/plays = no direct access for anon/authenticated at all.
revoke all on public.profiles, public.plays, public.user_library, public.feedback from anon, authenticated;

-- Releases are public info (version + download link).
drop policy if exists "app reads releases" on public.app_releases;
create policy "app reads releases" on public.app_releases for select to anon using (true);
grant select on public.app_releases to anon;

-- ---------- Functions the app calls ----------
create extension if not exists pgcrypto with schema extensions;

-- Create the profile on first call; later calls must present the same secret.
-- p_recovery = the user's backup code (only its hash is stored), used to restore after reinstall.
drop function if exists public.soniq_upsert_profile(text, text, text);
create or replace function public.soniq_upsert_profile(p_id text, p_name text, p_secret text, p_recovery text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text := encode(digest(p_secret, 'sha256'), 'hex');
  v_rec text := encode(digest(upper(p_recovery), 'sha256'), 'hex');
begin
  if p_id !~ '^SQ-[A-Z0-9]{4}-[A-Z0-9]{4}$' or length(coalesce(p_secret, '')) < 24
     or length(coalesce(p_recovery, '')) < 16 then
    raise exception 'bad request';
  end if;
  -- Spam guard: cap brand-new profiles across everyone (an install makes one profile).
  if not exists (select 1 from profiles where id = p_id)
     and (select count(*) from profiles where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'busy';
  end if;
  insert into profiles (id, name, secret_hash, recovery_hash)
  values (p_id, left(trim(p_name), 24), v_hash, v_rec)
  on conflict (id) do update
    set name = excluded.name, secret_hash = v_hash, recovery_hash = v_rec, updated_at = now()
    -- Only the device that owns the profile can change it. (Old versions also let anyone
    -- claim a profile without a secret; removed.)
    where profiles.secret_hash = v_hash;
  if not found then raise exception 'not allowed'; end if;
end $$;

-- Save the cloud backup (max ~1 MB).
create or replace function public.soniq_save_library(p_id text, p_secret text, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from profiles where id = p_id
                 and secret_hash = encode(digest(p_secret, 'sha256'), 'hex')) then
    raise exception 'not allowed';
  end if;
  if jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 1048576 then
    raise exception 'bad request';
  end if;
  insert into user_library (user_id, data, updated_at) values (p_id, p_data, now())
  on conflict (user_id) do update set data = excluded.data, updated_at = now();
end $$;

-- Wrong backup codes per SONIQ ID (for the restore lockout). Kept for a day.
create table if not exists public.restore_failures (
  id text not null,
  at timestamptz not null default now()
);
create index if not exists restore_failures_id_at on public.restore_failures (id, at desc);
alter table public.restore_failures enable row level security;

-- Restore on a new install: needs ID + backup code. The new install becomes the owner
-- (p_new_secret replaces the old device secret). Wrong codes are slowed down.
-- Old restore (raised on a wrong code, so failed tries could not be counted). Disabled:
-- apps from before v1.6.1 are asked to update.
create or replace function public.soniq_restore(p_id text, p_recovery text, p_new_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  raise exception 'update SONIQ to restore';
end $$;

-- Restore on a new install. Never raises on a wrong code: the failure must be saved for the
-- lockout (an exception would roll it back). Returns {"error": "..."} or the profile.
create or replace function public.soniq_restore_v2(p_id text, p_recovery text, p_new_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_profile profiles;
  v_id text := upper(trim(coalesce(p_id, '')));
begin
  if length(coalesce(p_new_secret, '')) < 24 then raise exception 'bad request'; end if;
  -- Lockout: 5 wrong codes for an ID in an hour blocks that ID for the rest of the hour,
  -- and 200 wrong codes overall in an hour pauses all restores (slows mass guessing).
  if (select count(*) from restore_failures where id = v_id and at > now() - interval '1 hour') >= 5
     or (select count(*) from restore_failures where at > now() - interval '1 hour') >= 200 then
    perform pg_sleep(1);
    return jsonb_build_object('error', 'locked');
  end if;
  select * into v_profile from profiles
   where id = v_id
     and recovery_hash = encode(digest(upper(trim(p_recovery)), 'sha256'), 'hex');
  if not found then
    insert into restore_failures (id) values (v_id);
    delete from restore_failures where at < now() - interval '1 day';
    perform pg_sleep(1);  -- makes guessing codes slow
    return jsonb_build_object('error', 'wrong id or code');
  end if;
  delete from restore_failures where id = v_id;
  update profiles set secret_hash = encode(digest(p_new_secret, 'sha256'), 'hex'), updated_at = now()
   where id = v_profile.id;
  return jsonb_build_object(
    'id', v_profile.id,
    'name', v_profile.name,
    'created_at', v_profile.created_at,
    'library', (select data from user_library where user_id = v_profile.id),
    'plays', coalesce((
      select jsonb_agg(p order by p.played_at desc) from (
        select track_id, title, artist, source, duration_sec, listened_sec, played_at
        from plays where user_id = v_profile.id order by played_at desc limit 500
      ) p), '[]'::jsonb)
  );
end $$;

-- Add up to 100 plays; max 500 plays per user per hour (stops spam).
create or replace function public.soniq_add_plays(p_id text, p_secret text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_count int;
begin
  if not exists (select 1 from profiles where id = p_id
                 and secret_hash = encode(digest(p_secret, 'sha256'), 'hex')) then
    raise exception 'not allowed';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'bad request';
  end if;
  if (select count(*) from plays where user_id = p_id and received_at > now() - interval '1 hour')
     + jsonb_array_length(p_rows) > 500 then
    raise exception 'rate limited';
  end if;
  insert into plays (user_id, track_id, title, artist, source, genre, duration_sec, listened_sec, played_at)
  select p_id,
         left(r->>'track_id', 200), left(r->>'title', 300), left(r->>'artist', 300),
         left(r->>'source', 20), left(r->>'genre', 50),
         least(greatest((r->>'duration_sec')::int, 0), 86400),
         least(greatest(coalesce((r->>'listened_sec')::int, 0), 0), 86400),
         least(coalesce((r->>'played_at')::timestamptz, now()), now())
  from jsonb_array_elements(p_rows) r;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Feature request form: max 10 per user per day.
create or replace function public.soniq_submit_feedback(p_id text, p_secret text, p_category text, p_message text, p_version text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_name text;
begin
  select name into v_name from profiles
   where id = p_id and secret_hash = encode(digest(p_secret, 'sha256'), 'hex');
  if not found then raise exception 'not allowed'; end if;
  if length(trim(coalesce(p_message, ''))) < 3 then raise exception 'bad request'; end if;
  if (select count(*) from feedback where user_id = p_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate limited';
  end if;
  insert into feedback (user_id, name, category, message, app_version)
  values (p_id, v_name, left(coalesce(p_category, 'Other'), 30), left(trim(p_message), 2000), left(p_version, 20));
end $$;

revoke all on function public.soniq_submit_feedback(text, text, text, text, text) from public;
grant execute on function public.soniq_submit_feedback(text, text, text, text, text) to anon;

revoke all on function public.soniq_upsert_profile(text, text, text, text) from public;
revoke all on function public.soniq_add_plays(text, text, jsonb) from public;
revoke all on function public.soniq_save_library(text, text, jsonb) from public;
revoke all on function public.soniq_restore(text, text, text) from public;
revoke all on function public.soniq_restore_v2(text, text, text) from public;
grant execute on function public.soniq_upsert_profile(text, text, text, text) to anon;
grant execute on function public.soniq_add_plays(text, text, jsonb) to anon;
grant execute on function public.soniq_save_library(text, text, jsonb) to anon;
grant execute on function public.soniq_restore(text, text, text) to anon;
grant execute on function public.soniq_restore_v2(text, text, text) to anon;

-- ---------- Friends ----------
-- Requests, friendships (stored both ways) and blocks. Only reachable through the functions below.
create table if not exists public.friend_requests (
  from_id text not null references public.profiles(id) on delete cascade,
  to_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);
create index if not exists friend_requests_to on public.friend_requests (to_id);

create table if not exists public.friends (
  user_id text not null references public.profiles(id) on delete cascade,
  friend_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

create table if not exists public.blocks (
  user_id text not null references public.profiles(id) on delete cascade,
  blocked_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);

alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;
alter table public.blocks enable row level security;
revoke all on public.friend_requests, public.friends, public.blocks from anon, authenticated;

-- Internal: raise unless p_secret belongs to p_id. Not callable by the app directly.
create or replace function public.soniq_check(p_id text, p_secret text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from profiles where id = p_id
                 and secret_hash = encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex')) then
    raise exception 'not allowed';
  end if;
end $$;
revoke all on function public.soniq_check(text, text) from public, anon, authenticated;

-- Send a request. Returns 'sent' or 'friends' (if they had already asked you, you're now friends).
create or replace function public.soniq_friend_request(p_id text, p_secret text, p_to text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_to text := upper(trim(coalesce(p_to, '')));
begin
  perform soniq_check(p_id, p_secret);
  if v_to = p_id then raise exception 'that is you'; end if;
  if not exists (select 1 from profiles where id = v_to) then
    perform pg_sleep(0.5);  -- slows down guessing IDs
    raise exception 'no such user';
  end if;
  if exists (select 1 from blocks where user_id = p_id and blocked_id = v_to) then
    raise exception 'you blocked them';
  end if;
  if exists (select 1 from friends where user_id = p_id and friend_id = v_to) then return 'friends'; end if;
  -- If they blocked you, pretend it worked (don't reveal the block).
  if exists (select 1 from blocks where user_id = v_to and blocked_id = p_id) then return 'sent'; end if;
  if exists (select 1 from friend_requests where from_id = v_to and to_id = p_id) then
    if (select count(*) from friends where user_id = p_id) >= 200 then raise exception 'friend limit'; end if;
    delete from friend_requests where (from_id = v_to and to_id = p_id) or (from_id = p_id and to_id = v_to);
    insert into friends (user_id, friend_id) values (p_id, v_to), (v_to, p_id) on conflict do nothing;
    return 'friends';
  end if;
  if (select count(*) from friends where user_id = p_id) >= 200 then raise exception 'friend limit'; end if;
  if (select count(*) from friend_requests where from_id = p_id) >= 50
     or (select count(*) from friend_requests where from_id = p_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate limited';
  end if;
  insert into friend_requests (from_id, to_id) values (p_id, v_to) on conflict do nothing;
  return 'sent';
end $$;

-- Accept or decline a request someone sent you.
create or replace function public.soniq_friend_respond(p_id text, p_secret text, p_from text, p_accept boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  delete from friend_requests where from_id = p_from and to_id = p_id;
  if not found then raise exception 'request not found'; end if;
  if p_accept then
    if (select count(*) from friends where user_id = p_id) >= 200 then raise exception 'friend limit'; end if;
    insert into friends (user_id, friend_id) values (p_id, p_from), (p_from, p_id) on conflict do nothing;
  end if;
end $$;

-- Unfriend, or cancel a request you sent.
create or replace function public.soniq_friend_remove(p_id text, p_secret text, p_other text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  delete from friends where (user_id = p_id and friend_id = p_other) or (user_id = p_other and friend_id = p_id);
  delete from friend_requests where (from_id = p_id and to_id = p_other) or (from_id = p_other and to_id = p_id);
end $$;

-- Block: also unfriends and removes requests both ways.
create or replace function public.soniq_friend_block(p_id text, p_secret text, p_other text, p_block boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  if p_block then
    if p_other = p_id or not exists (select 1 from profiles where id = p_other) then raise exception 'bad request'; end if;
    delete from friends where (user_id = p_id and friend_id = p_other) or (user_id = p_other and friend_id = p_id);
    delete from friend_requests where (from_id = p_id and to_id = p_other) or (from_id = p_other and to_id = p_id);
    insert into blocks (user_id, blocked_id) values (p_id, p_other) on conflict do nothing;
  else
    delete from blocks where user_id = p_id and blocked_id = p_other;
  end if;
end $$;

-- Everything the Friends screen shows. Only your own lists; others' names only.
create or replace function public.soniq_friends_list(p_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  return jsonb_build_object(
    'friends', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'at', f.created_at,
                  'jam', (select jsonb_build_object('code', j.code, 'host', j.is_host, 'title', j.track_title,
                                                    'artist', j.track_artist, 'members', j.members)
                          from jams j where j.user_id = p.id and j.updated_at > now() - interval '90 seconds'))
                  order by lower(p.name))
                from friends f join profiles p on p.id = f.friend_id where f.user_id = p_id), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'at', r.created_at) order by r.created_at desc)
                from friend_requests r join profiles p on p.id = r.from_id where r.to_id = p_id), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'at', r.created_at) order by r.created_at desc)
                from friend_requests r join profiles p on p.id = r.to_id where r.from_id = p_id), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'at', b.created_at) order by b.created_at desc)
                from blocks b join profiles p on p.id = b.blocked_id where b.user_id = p_id), '[]'::jsonb)
  );
end $$;

revoke all on function public.soniq_friend_request(text, text, text) from public;
revoke all on function public.soniq_friend_respond(text, text, text, boolean) from public;
revoke all on function public.soniq_friend_remove(text, text, text) from public;
revoke all on function public.soniq_friend_block(text, text, text, boolean) from public;
revoke all on function public.soniq_friends_list(text, text) from public;
grant execute on function public.soniq_friend_request(text, text, text) to anon;
grant execute on function public.soniq_friend_respond(text, text, text, boolean) to anon;
grant execute on function public.soniq_friend_remove(text, text, text) to anon;
grant execute on function public.soniq_friend_block(text, text, text, boolean) to anon;
grant execute on function public.soniq_friends_list(text, text) to anon;

-- ---------- Public Jams (friends can see + join) ----------
-- Only PUBLIC Jams are stored. Private Jams never reach the database, so nobody can see them.
-- Each listener in a public Jam (host or guest) has one row, refreshed every ~30 s;
-- rows older than 90 s are ignored (app closed / phone offline).
create table if not exists public.jams (
  user_id text primary key references public.profiles(id) on delete cascade,
  code text not null,
  is_host boolean not null default false,
  track_title text,
  track_artist text,
  members int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.jams enable row level security;
revoke all on public.jams from anon, authenticated;

create or replace function public.soniq_jam_announce(p_id text, p_secret text, p_code text, p_host boolean,
                                                     p_title text, p_artist text, p_members int)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  if coalesce(p_code, '') !~ '^[A-Z0-9]{6}$' then raise exception 'bad request'; end if;
  insert into jams (user_id, code, is_host, track_title, track_artist, members, updated_at)
  values (p_id, p_code, coalesce(p_host, false), left(p_title, 200), left(p_artist, 200),
          least(greatest(coalesce(p_members, 1), 1), 500), now())
  on conflict (user_id) do update set code = excluded.code, is_host = excluded.is_host,
    track_title = excluded.track_title, track_artist = excluded.track_artist,
    members = excluded.members, updated_at = now();
end $$;

create or replace function public.soniq_jam_end(p_id text, p_secret text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  delete from jams where user_id = p_id;
end $$;

revoke all on function public.soniq_jam_announce(text, text, text, boolean, text, text, int) from public;
revoke all on function public.soniq_jam_end(text, text) from public;
grant execute on function public.soniq_jam_announce(text, text, text, boolean, text, text, int) to anon;
grant execute on function public.soniq_jam_end(text, text) to anon;

-- ---------- Clans ----------
-- Invite-only groups (max 30 members) with a small text chat (only the latest 50 messages
-- per clan are kept) and Jam cards. Only reachable through the soniq_clan_* functions.
create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '🎧',
  owner_id text not null references public.profiles(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.clan_members (
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  is_owner boolean not null default false,
  last_read bigint not null default 0,          -- id of the last message this member has seen
  joined_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create index if not exists clan_members_user on public.clan_members (user_id);

-- People the owner removed (can't rejoin with the code).
create table if not exists public.clan_bans (
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  primary key (clan_id, user_id)
);

create table if not exists public.clan_messages (
  id bigint generated always as identity primary key,
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id text references public.profiles(id) on delete set null,
  kind text not null default 'text',            -- text | jam | system
  body text not null default '',                -- system: joined | left | removed
  jam_code text,
  created_at timestamptz not null default now()
);
alter table public.clan_messages add column if not exists jam_ended boolean not null default false;
create index if not exists clan_messages_clan on public.clan_messages (clan_id, id desc);
create index if not exists clan_messages_jam on public.clan_messages (jam_code) where jam_code is not null;
create index if not exists clan_messages_user_time on public.clan_messages (user_id, created_at desc);

alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.clan_bans enable row level security;
alter table public.clan_messages enable row level security;
revoke all on public.clans, public.clan_members, public.clan_bans, public.clan_messages from anon, authenticated;

-- Keep only the newest 50 messages of each clan (database never fills up).
create or replace function public.soniq_clan_trim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from clan_messages where clan_id = new.clan_id and id <= (
    select id from clan_messages where clan_id = new.clan_id order by id desc offset 50 limit 1);
  return null;
end $$;
drop trigger if exists clan_messages_trim on public.clan_messages;
create trigger clan_messages_trim after insert on public.clan_messages
  for each row execute function public.soniq_clan_trim();

-- Internal: random 8-character invite code.
create or replace function public.soniq_clan_code()
returns text language plpgsql set search_path = public, extensions as $$
declare
  a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := gen_random_bytes(8);
  c text := '';
begin
  for i in 0..7 loop c := c || substr(a, 1 + (get_byte(b, i) % 32), 1); end loop;
  return c;
end $$;

-- Internal: raises unless p_id is a member; returns true for the owner.
create or replace function public.soniq_clan_role(p_id text, p_clan uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  select is_owner into v from clan_members where clan_id = p_clan and user_id = p_id;
  if not found then raise exception 'not a member'; end if;
  return v;
end $$;

revoke all on function public.soniq_clan_trim() from public, anon, authenticated;
revoke all on function public.soniq_clan_code() from public, anon, authenticated;
revoke all on function public.soniq_clan_role(text, uuid) from public, anon, authenticated;

create or replace function public.soniq_clan_create(p_id text, p_secret text, p_name text, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_code text;
  v_name text := left(trim(coalesce(p_name, '')), 30);
begin
  perform soniq_check(p_id, p_secret);
  if length(v_name) < 2 then raise exception 'bad name'; end if;
  if (select count(*) from clans where owner_id = p_id) >= 5 then raise exception 'clan limit'; end if;
  if (select count(*) from clan_members where user_id = p_id) >= 20 then raise exception 'too many clans'; end if;
  loop
    v_code := soniq_clan_code();
    exit when not exists (select 1 from clans where invite_code = v_code);
  end loop;
  insert into clans (name, emoji, owner_id, invite_code)
  values (v_name, left(coalesce(nullif(trim(p_emoji), ''), '🎧'), 8), p_id, v_code)
  returning id into v_id;
  insert into clan_members (clan_id, user_id, is_owner) values (v_id, p_id, true);
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

create or replace function public.soniq_clan_join(p_id text, p_secret text, p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v clans; v_msg bigint;
begin
  perform soniq_check(p_id, p_secret);
  select * into v from clans where invite_code = upper(trim(coalesce(p_code, '')));
  if not found then
    perform pg_sleep(0.5);  -- slows down guessing codes
    raise exception 'no such clan';
  end if;
  if exists (select 1 from clan_members where clan_id = v.id and user_id = p_id) then
    return jsonb_build_object('id', v.id, 'name', v.name);
  end if;
  if exists (select 1 from clan_bans where clan_id = v.id and user_id = p_id) then raise exception 'removed from clan'; end if;
  if (select count(*) from clan_members where clan_id = v.id) >= 30 then raise exception 'clan full'; end if;
  if (select count(*) from clan_members where user_id = p_id) >= 20 then raise exception 'too many clans'; end if;
  insert into clan_messages (clan_id, user_id, kind, body) values (v.id, p_id, 'system', 'joined')
  returning id into v_msg;
  insert into clan_members (clan_id, user_id, last_read) values (v.id, p_id, v_msg);
  return jsonb_build_object('id', v.id, 'name', v.name);
end $$;

-- Leave. If the owner leaves, the longest-standing member becomes owner (or the clan is deleted).
create or replace function public.soniq_clan_leave(p_id text, p_secret text, p_clan uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_owner boolean; v_next text;
begin
  perform soniq_check(p_id, p_secret);
  v_owner := soniq_clan_role(p_id, p_clan);
  delete from clan_members where clan_id = p_clan and user_id = p_id;
  if v_owner then
    select user_id into v_next from clan_members where clan_id = p_clan order by joined_at limit 1;
    if v_next is null then
      delete from clans where id = p_clan;
      return;
    end if;
    update clan_members set is_owner = true where clan_id = p_clan and user_id = v_next;
    update clans set owner_id = v_next where id = p_clan;
  end if;
  insert into clan_messages (clan_id, user_id, kind, body) values (p_clan, p_id, 'system', 'left');
end $$;

create or replace function public.soniq_clan_kick(p_id text, p_secret text, p_clan uuid, p_user text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  if not soniq_clan_role(p_id, p_clan) then raise exception 'owner only'; end if;
  if p_user = p_id then raise exception 'bad request'; end if;
  delete from clan_members where clan_id = p_clan and user_id = p_user;
  if not found then return; end if;
  insert into clan_bans (clan_id, user_id) values (p_clan, p_user) on conflict do nothing;
  insert into clan_messages (clan_id, user_id, kind, body) values (p_clan, p_user, 'system', 'removed');
end $$;

create or replace function public.soniq_clan_delete(p_id text, p_secret text, p_clan uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  if not soniq_clan_role(p_id, p_clan) then raise exception 'owner only'; end if;
  delete from clans where id = p_clan;
end $$;

-- New invite code (old links stop working).
create or replace function public.soniq_clan_reset_code(p_id text, p_secret text, p_clan uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_code text;
begin
  perform soniq_check(p_id, p_secret);
  if not soniq_clan_role(p_id, p_clan) then raise exception 'owner only'; end if;
  loop
    v_code := soniq_clan_code();
    exit when not exists (select 1 from clans where invite_code = v_code);
  end loop;
  update clans set invite_code = v_code where id = p_clan;
  return v_code;
end $$;

-- Your clans with unread count and last message.
create or replace function public.soniq_clans_list(p_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  return coalesce((
    select jsonb_agg(x order by x->>'last_at' desc) from (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'emoji', c.emoji, 'code', c.invite_code, 'owner', m.is_owner,
        'members', (select count(*) from clan_members mm where mm.clan_id = c.id),
        'unread', (select count(*) from clan_messages cm
                    where cm.clan_id = c.id and cm.id > m.last_read and cm.user_id is distinct from p_id),
        'last', (select jsonb_build_object('kind', cm.kind, 'body', cm.body, 'name', p.name, 'at', cm.created_at)
                   from clan_messages cm left join profiles p on p.id = cm.user_id
                  where cm.clan_id = c.id order by cm.id desc limit 1),
        'last_at', coalesce((select max(cm.created_at) from clan_messages cm where cm.clan_id = c.id), c.created_at)
      ) as x
      from clan_members m join clans c on c.id = m.clan_id
      where m.user_id = p_id
    ) s), '[]'::jsonb);
end $$;

-- Open a clan: details, members, messages. Marks everything as read.
create or replace function public.soniq_clan_open(p_id text, p_secret text, p_clan uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_owner boolean; v clans; v_max bigint;
begin
  perform soniq_check(p_id, p_secret);
  v_owner := soniq_clan_role(p_id, p_clan);
  select * into v from clans where id = p_clan;
  select max(id) into v_max from clan_messages where clan_id = p_clan;
  update clan_members set last_read = greatest(last_read, coalesce(v_max, 0))
   where clan_id = p_clan and user_id = p_id;
  return jsonb_build_object(
    'id', v.id, 'name', v.name, 'emoji', v.emoji, 'code', v.invite_code, 'owner', v_owner,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'owner', m.is_owner)
                       order by m.is_owner desc, lower(p.name))
        from clan_members m join profiles p on p.id = m.user_id where m.clan_id = p_clan), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', cm.id, 'user_id', cm.user_id, 'name', coalesce(p.name, 'Someone'),
                                          'kind', cm.kind, 'body', cm.body, 'jam', cm.jam_code, 'at', cm.created_at,
                                          'ended', cm.jam_ended or cm.created_at < now() - interval '12 hours')
                       order by cm.id)
        from clan_messages cm left join profiles p on p.id = cm.user_id where cm.clan_id = p_clan), '[]'::jsonb)
  );
end $$;

-- Send a text (max 300 chars) or a Jam card. Max 20 messages per minute per user.
create or replace function public.soniq_clan_send(p_id text, p_secret text, p_clan uuid, p_body text, p_jam text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_body text := left(trim(coalesce(p_body, '')), 300); v_id bigint;
begin
  perform soniq_check(p_id, p_secret);
  perform soniq_clan_role(p_id, p_clan);
  if p_jam is not null then
    if p_jam !~ '^[A-Z0-9]{6}$' then raise exception 'bad request'; end if;
  elsif length(v_body) = 0 then
    raise exception 'bad request';
  end if;
  if (select count(*) from clan_messages where user_id = p_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate limited';
  end if;
  if p_jam is not null then
    update clan_messages set jam_ended = true
     where user_id = p_id and kind = 'jam' and jam_code <> p_jam and not jam_ended;
  end if;
  insert into clan_messages (clan_id, user_id, kind, body, jam_code)
  values (p_clan, p_id, case when p_jam is null then 'text' else 'jam' end, v_body, p_jam)
  returning id into v_id;
  update clan_members set last_read = v_id where clan_id = p_clan and user_id = p_id;
  return v_id;
end $$;

-- A Jam ended: mark its cards "ended" in the caller's clans. Returns those clan ids (to refresh).
create or replace function public.soniq_clan_jam_end(p_id text, p_secret text, p_code text)
returns uuid[] language plpgsql security definer set search_path = public, extensions as $$
declare v_ids uuid[];
begin
  perform soniq_check(p_id, p_secret);
  with changed as (
    update clan_messages set jam_ended = true
     where kind = 'jam' and jam_code = upper(coalesce(p_code, '')) and not jam_ended
       and clan_id in (select clan_id from clan_members where user_id = p_id)
    returning clan_id
  )
  select coalesce(array_agg(distinct clan_id), '{}') into v_ids from changed;
  return v_ids;
end $$;

revoke all on function public.soniq_clan_jam_end(text, text, text) from public;
grant execute on function public.soniq_clan_jam_end(text, text, text) to anon;
revoke all on function public.soniq_clan_create(text, text, text, text) from public;
revoke all on function public.soniq_clan_join(text, text, text) from public;
revoke all on function public.soniq_clan_leave(text, text, uuid) from public;
revoke all on function public.soniq_clan_kick(text, text, uuid, text) from public;
revoke all on function public.soniq_clan_delete(text, text, uuid) from public;
revoke all on function public.soniq_clan_reset_code(text, text, uuid) from public;
revoke all on function public.soniq_clans_list(text, text) from public;
revoke all on function public.soniq_clan_open(text, text, uuid) from public;
revoke all on function public.soniq_clan_send(text, text, uuid, text, text) from public;
grant execute on function public.soniq_clan_create(text, text, text, text) to anon;
grant execute on function public.soniq_clan_join(text, text, text) to anon;
grant execute on function public.soniq_clan_leave(text, text, uuid) to anon;
grant execute on function public.soniq_clan_kick(text, text, uuid, text) to anon;
grant execute on function public.soniq_clan_delete(text, text, uuid) to anon;
grant execute on function public.soniq_clan_reset_code(text, text, uuid) to anon;
grant execute on function public.soniq_clans_list(text, text) to anon;
grant execute on function public.soniq_clan_open(text, text, uuid) to anon;
grant execute on function public.soniq_clan_send(text, text, uuid, text, text) to anon;

-- ---------- Profile photos (Storage) ----------
-- Public-read bucket for <profile id>/avatar.<ext>. The app can only READ it directly.
-- Uploads go through the `avatar` Edge Function: it checks the device secret and hands out a
-- one-time upload URL for that user's own path only. Images only, max 2 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
on conflict (id) do update set public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "app reads avatars" on storage.objects;
create policy "app reads avatars" on storage.objects
  for select to anon using (bucket_id = 'avatars');

-- Old versions let anyone upload / overwrite any photo. Removed.
drop policy if exists "app uploads avatars" on storage.objects;
drop policy if exists "app updates avatars" on storage.objects;

-- ---------- Server-side helpers for Edge Functions (service role only) ----------
-- True when the device secret matches. Only Edge Functions (service role) can call it.
create or replace function public.soniq_verify(p_id text, p_secret text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from profiles where id = p_id
                  and secret_hash = encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex'))
$$;
revoke all on function public.soniq_verify(text, text) from public, anon, authenticated;
grant execute on function public.soniq_verify(text, text) to service_role;

-- AI (Groq) calls go through the `ai` Edge Function; the Groq key never ships in the app.
-- Each user gets a daily allowance so one person (or a stolen ID) can't burn the shared quota.
create table if not exists public.ai_usage (
  user_id text not null references public.profiles(id) on delete cascade,
  day date not null default current_date,
  calls int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

-- Verify the device and count one AI call. Returns calls left today; raises 'ai limit' when out.
create or replace function public.soniq_ai_take(p_id text, p_secret text, p_limit int)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_calls int;
begin
  if not soniq_verify(p_id, p_secret) then raise exception 'not allowed'; end if;
  insert into ai_usage (user_id, day, calls) values (p_id, current_date, 1)
  on conflict (user_id, day) do update set calls = ai_usage.calls + 1
  returning calls into v_calls;
  if v_calls > p_limit then raise exception 'ai limit'; end if;
  return p_limit - v_calls;
end $$;
revoke all on function public.soniq_ai_take(text, text, int) from public, anon, authenticated;
grant execute on function public.soniq_ai_take(text, text, int) to service_role;

-- ---------- Public playlists (community) ----------
-- A user can publish any of their playlists. Anyone can read and play a public playlist;
-- only the owner can change it. Everything goes through the soniq_playlist_* functions.
create table if not exists public.public_playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(id) on delete cascade,
  name text not null,
  tracks jsonb not null default '[]'::jsonb,
  track_count int not null default 0,
  covers jsonb not null default '[]'::jsonb,   -- up to 4 artwork URLs for the collage
  play_count int not null default 0,
  saves_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists public_playlists_owner on public.public_playlists (owner_id);
create index if not exists public_playlists_trending on public.public_playlists (play_count desc, updated_at desc);
create index if not exists public_playlists_new on public.public_playlists (created_at desc);

-- One play / one save counted per user per playlist per day (keeps counts honest).
create table if not exists public.public_playlist_events (
  playlist_id uuid not null references public.public_playlists(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('play', 'save')),
  day date not null default current_date,
  primary key (playlist_id, user_id, kind, day)
);

create table if not exists public.public_playlist_reports (
  id bigint generated always as identity primary key,
  playlist_id uuid not null references public.public_playlists(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (playlist_id, user_id)
);

alter table public.public_playlists enable row level security;
alter table public.public_playlist_events enable row level security;
alter table public.public_playlist_reports enable row level security;

-- Summary row used by lists (no tracks).
create or replace function public.soniq_playlist_card(v public.public_playlists)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', v.id, 'name', v.name, 'owner_id', v.owner_id,
    'owner_name', coalesce((select name from profiles where id = v.owner_id), 'Someone'),
    'track_count', v.track_count, 'covers', v.covers,
    'plays', v.play_count, 'saves', v.saves_count, 'updated_at', v.updated_at)
$$;
revoke all on function public.soniq_playlist_card(public.public_playlists) from public, anon, authenticated;

-- Create or update your public copy. Returns its id.
create or replace function public.soniq_playlist_publish(
  p_id text, p_secret text, p_playlist uuid, p_name text, p_tracks jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 60);
  v_tracks jsonb := coalesce(p_tracks, '[]'::jsonb);
  v_id uuid;
  v_covers jsonb;
begin
  perform soniq_check(p_id, p_secret);
  if length(v_name) < 1 then raise exception 'bad name'; end if;
  if jsonb_typeof(v_tracks) <> 'array' then raise exception 'bad tracks'; end if;
  if jsonb_array_length(v_tracks) > 500 then raise exception 'too many songs'; end if;
  if pg_column_size(v_tracks) > 400000 then raise exception 'playlist too big'; end if;
  if exists (select 1 from jsonb_array_elements(v_tracks) t
             where jsonb_typeof(t) <> 'object' or coalesce(t->>'id', '') = ''
                or coalesce(t->>'title', '') = '' or coalesce(t->>'source', '') = '') then
    raise exception 'bad tracks';
  end if;
  -- First 4 distinct https covers, in playlist order.
  select coalesce(jsonb_agg(u order by first_pos), '[]'::jsonb) into v_covers from (
    select u, min(ord) as first_pos
      from (select t->>'artworkUrl' as u, ord
              from jsonb_array_elements(v_tracks) with ordinality as e(t, ord)
             where coalesce(t->>'artworkUrl', '') like 'https://%') x
     group by u order by min(ord) limit 4) c;

  if p_playlist is not null then
    update public_playlists
       set name = v_name, tracks = v_tracks, track_count = jsonb_array_length(v_tracks),
           covers = v_covers, updated_at = now()
     where id = p_playlist and owner_id = p_id
     returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;

  if (select count(*) from public_playlists where owner_id = p_id) >= 50 then
    raise exception 'public playlist limit';
  end if;
  insert into public_playlists (owner_id, name, tracks, track_count, covers)
  values (p_id, v_name, v_tracks, jsonb_array_length(v_tracks), v_covers)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.soniq_playlist_unpublish(p_id text, p_secret text, p_playlist uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  delete from public_playlists where id = p_playlist and owner_id = p_id;
end $$;

-- Full playlist with tracks. Anyone with the app can read a public playlist.
create or replace function public.soniq_playlist_get(p_playlist uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public_playlists;
begin
  select * into v from public_playlists where id = p_playlist;
  if v.id is null then raise exception 'no such playlist'; end if;
  return soniq_playlist_card(v) || jsonb_build_object('tracks', v.tracks);
end $$;

-- Browse: 'trending' (most played, recent first) or 'new'. Optional name search.
create or replace function public.soniq_playlist_discover(p_sort text, p_query text, p_limit int, p_offset int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := nullif(left(trim(coalesce(p_query, '')), 60), '');
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  return coalesce((
    select jsonb_agg(soniq_playlist_card(p) order by
             case when p_sort = 'new' then extract(epoch from p.created_at)
                  else p.play_count * 1000 + extract(epoch from p.updated_at) / 86400 end desc)
      from (select * from public_playlists
             where track_count > 0
               and (v_q is null or name ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
             order by case when p_sort = 'new' then extract(epoch from created_at)
                           else play_count * 1000 + extract(epoch from updated_at) / 86400 end desc
             limit v_limit offset greatest(coalesce(p_offset, 0), 0)) p), '[]'::jsonb);
end $$;

-- Someone else's playlists: counted once per user per day; your own plays don't count.
create or replace function public.soniq_playlist_event(p_id text, p_secret text, p_playlist uuid, p_kind text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  if p_kind not in ('play', 'save') then raise exception 'bad event'; end if;
  if exists (select 1 from public_playlists where id = p_playlist and owner_id = p_id) then return; end if;
  insert into public_playlist_events (playlist_id, user_id, kind)
  values (p_playlist, p_id, p_kind) on conflict do nothing;
  if found then
    update public_playlists
       set play_count = play_count + (p_kind = 'play')::int,
           saves_count = saves_count + (p_kind = 'save')::int
     where id = p_playlist;
  end if;
end $$;

create or replace function public.soniq_playlist_report(p_id text, p_secret text, p_playlist uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform soniq_check(p_id, p_secret);
  insert into public_playlist_reports (playlist_id, user_id, reason)
  values (p_playlist, p_id, left(coalesce(nullif(trim(p_reason), ''), 'other'), 200))
  on conflict do nothing;
end $$;

revoke all on function public.soniq_playlist_publish(text, text, uuid, text, jsonb) from public;
revoke all on function public.soniq_playlist_unpublish(text, text, uuid) from public;
revoke all on function public.soniq_playlist_get(uuid) from public;
revoke all on function public.soniq_playlist_discover(text, text, int, int) from public;
revoke all on function public.soniq_playlist_event(text, text, uuid, text) from public;
revoke all on function public.soniq_playlist_report(text, text, uuid, text) from public;
grant execute on function public.soniq_playlist_publish(text, text, uuid, text, jsonb) to anon;
grant execute on function public.soniq_playlist_unpublish(text, text, uuid) to anon;
grant execute on function public.soniq_playlist_get(uuid) to anon;
grant execute on function public.soniq_playlist_discover(text, text, int, int) to anon;
grant execute on function public.soniq_playlist_event(text, text, uuid, text) to anon;
grant execute on function public.soniq_playlist_report(text, text, uuid, text) to anon;

-- ---------- Stats (for you in the dashboard; NOT readable by the app) ----------
drop view if exists public.user_track_stats, public.user_artist_stats,
                    public.user_genre_stats, public.user_listening_time;
create view public.user_track_stats with (security_invoker = true) as
  select user_id, track_id, max(title) as title, max(artist) as artist, count(*) as play_count,
         round(sum(listened_sec) / 60.0, 1) as minutes_listened, max(played_at) as last_played
  from public.plays group by user_id, track_id;

create view public.user_artist_stats with (security_invoker = true) as
  select user_id, artist, count(*) as play_count,
         round(sum(listened_sec) / 60.0, 1) as minutes_listened, max(played_at) as last_played
  from public.plays group by user_id, artist;

create view public.user_genre_stats with (security_invoker = true) as
  select user_id, genre, count(*) as play_count, round(sum(listened_sec) / 60.0, 1) as minutes_listened
  from public.plays where genre is not null group by user_id, genre;

create view public.user_listening_time with (security_invoker = true) as
  select user_id, (played_at at time zone 'Asia/Kolkata')::date as day,
         count(*) as plays, round(sum(listened_sec) / 60.0, 1) as minutes_listened
  from public.plays group by user_id, day;

revoke all on public.user_track_stats, public.user_artist_stats,
              public.user_genre_stats, public.user_listening_time from anon, authenticated;

-- Make the API see the new/changed functions right away.
notify pgrst, 'reload schema';
