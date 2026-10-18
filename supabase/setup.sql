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
  insert into profiles (id, name, secret_hash, recovery_hash)
  values (p_id, left(trim(p_name), 24), v_hash, v_rec)
  on conflict (id) do update
    set name = excluded.name, secret_hash = v_hash, recovery_hash = v_rec, updated_at = now()
    -- the first device to send a secret for an old profile claims it
    where profiles.secret_hash = v_hash or profiles.secret_hash is null;
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

-- Restore on a new install: needs ID + backup code. The new install becomes the owner
-- (p_new_secret replaces the old device secret). Wrong codes are slowed down.
create or replace function public.soniq_restore(p_id text, p_recovery text, p_new_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_profile profiles;
begin
  if length(coalesce(p_new_secret, '')) < 24 then raise exception 'bad request'; end if;
  select * into v_profile from profiles
   where id = upper(trim(p_id))
     and recovery_hash = encode(digest(upper(trim(p_recovery)), 'sha256'), 'hex');
  if not found then
    perform pg_sleep(1);  -- makes guessing codes slow
    raise exception 'wrong id or code';
  end if;
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
grant execute on function public.soniq_upsert_profile(text, text, text, text) to anon;
grant execute on function public.soniq_add_plays(text, text, jsonb) to anon;
grant execute on function public.soniq_save_library(text, text, jsonb) to anon;
grant execute on function public.soniq_restore(text, text, text) to anon;

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
