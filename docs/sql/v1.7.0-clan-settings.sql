-- v1.7.0 clan settings: run once in Supabase > SQL Editor (after the two ALTER TABLE lines).

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
  if (select count(*) from clan_members where clan_id = v.id) >= least(coalesce(v.max_members, 30), 30) then
    raise exception 'clan full';
  end if;
  if (select count(*) from clan_members where user_id = p_id) >= 20 then raise exception 'too many clans'; end if;
  insert into clan_messages (clan_id, user_id, kind, body) values (v.id, p_id, 'system', 'joined')
  returning id into v_msg;
  insert into clan_members (clan_id, user_id, last_read) values (v.id, p_id, v_msg);
  return jsonb_build_object('id', v.id, 'name', v.name);
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
        'description', c.description, 'max_members', c.max_members,
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
    'description', v.description, 'max_members', v.max_members,
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

-- Owner changes name / emoji / description / member cap. Null = keep as is.
-- The cap can't go below the current member count. Posts a system message so everyone sees it.
create or replace function public.soniq_clan_update(p_id text, p_secret text, p_clan uuid,
  p_name text, p_emoji text, p_description text, p_max int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v clans;
  v_name text := left(trim(coalesce(p_name, '')), 30);
  v_count int;
begin
  perform soniq_check(p_id, p_secret);
  if not soniq_clan_role(p_id, p_clan) then raise exception 'owner only'; end if;
  select * into v from clans where id = p_clan;
  if p_name is not null and length(v_name) < 2 then raise exception 'bad name'; end if;
  select count(*) into v_count from clan_members where clan_id = p_clan;
  if p_max is not null and (p_max < 2 or p_max > 30) then raise exception 'bad request'; end if;
  if p_max is not null and p_max < v_count then raise exception 'below members'; end if;
  update clans set
    name = case when p_name is null then name else v_name end,
    emoji = case when p_emoji is null then emoji else left(coalesce(nullif(trim(p_emoji), ''), '🎧'), 8) end,
    description = case when p_description is null then description else left(trim(p_description), 80) end,
    max_members = coalesce(p_max, max_members)
  where id = p_clan;
  if (p_name is not null and v_name <> v.name) or (p_emoji is not null and p_emoji <> v.emoji)
     or (p_description is not null and left(trim(p_description), 80) <> v.description)
     or (p_max is not null and p_max <> v.max_members) then
    insert into clan_messages (clan_id, user_id, kind, body) values (p_clan, p_id, 'system', 'updated');
  end if;
end $$;
revoke all on function public.soniq_clan_update(text, text, uuid, text, text, text, int) from public;
grant execute on function public.soniq_clan_update(text, text, uuid, text, text, text, int) to anon;
