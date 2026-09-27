-- Game Party Extravaganza: core schema, RLS, Realtime Authorization, storage.
-- See SRD sections 7 and 8.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables (SRD §7). host_uid / auth_uid link rows to Supabase anonymous-auth
-- users so Row Level Security and Realtime Authorization can check them.
-- ---------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code char(4) unique not null,
  host_secret text not null,            -- proves a browser is the host
  host_uid uuid not null,               -- auth user currently acting as host
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'ended')),
  current_game text,
  settings jsonb not null default '{}',
  state_snapshot jsonb,
  last_activity timestamptz default now(),
  created_at timestamptz default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  auth_uid uuid not null,
  name varchar(12) not null,
  color text not null,
  token text not null,                  -- stored in localStorage for reconnect
  is_vip boolean default false,
  is_audience boolean default false,
  score int default 0,
  games_won int default 0,
  joined_at timestamptz default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  game text not null,
  round int not null,
  kind text not null check (kind in ('text', 'drawing', 'vote', 'bid')),
  content jsonb not null,
  created_at timestamptz default now()
);

create table public.prompts (
  id serial primary key,
  game text not null,
  text text not null,
  answer text,                          -- trivia answer, real fact, secret word
  decoys text[],                        -- House answers and decoys
  family_friendly boolean default true
);

create index players_room_id_idx on public.players (room_id);
create index players_auth_uid_idx on public.players (auth_uid);
create unique index players_room_token_idx on public.players (room_id, token);
create index submissions_room_id_idx on public.submissions (room_id);
create index submissions_player_id_idx on public.submissions (player_id);
create index prompts_game_idx on public.prompts (game, family_friendly);
create index rooms_last_activity_idx on public.rooms (last_activity);
create index rooms_host_uid_idx on public.rooms (host_uid);

-- ---------------------------------------------------------------------------
-- Private schema: API secret and rate-limit counters. Never exposed to clients.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table private.app_secrets (
  name text primary key,
  value text not null
);

create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

create or replace function private.assert_api_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or not exists (
    select 1 from private.app_secrets s where s.name = 'api' and s.value = p_secret
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end;
$$;

-- Fixed-window counter. Returns true while the caller is under the limit.
create or replace function private.hit_rate_limit(p_key text, p_limit int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into private.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - p_window then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning r.count into v_count;
  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Membership helpers used by RLS and Realtime policies.
-- ---------------------------------------------------------------------------

create or replace function private.is_room_host(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rooms r where r.id = p_room_id and r.host_uid = (select auth.uid())
  );
$$;

create or replace function private.is_any_host()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.rooms r where r.host_uid = (select auth.uid()));
$$;

create or replace function private.is_room_player(p_room_id text, p_player_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    where p.room_id::text = p_room_id
      and p.id::text = p_player_id
      and p.auth_uid = (select auth.uid())
  );
$$;

-- Realtime Authorization for the three channel families in SRD §7:
--   room:{code}              host + members read; host broadcasts; members track presence
--   room:{code}:host         members send actions; only the host reads
--   room:{code}:p:{playerId} only that player reads; only the host sends
create or replace function private.realtime_can(p_topic text, p_extension text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_room uuid;
  v_host boolean;
  v_member boolean;
begin
  if p_topic is null
     or p_topic !~ '^room:[A-Z]{4}(:host|:p:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$' then
    return false;
  end if;
  v_parts := string_to_array(p_topic, ':');

  select r.id, r.host_uid = (select auth.uid())
    into v_room, v_host
    from public.rooms r
   where r.code = v_parts[2];
  if v_room is null then
    return false;
  end if;

  v_member := exists (
    select 1 from public.players p where p.room_id = v_room and p.auth_uid = (select auth.uid())
  );

  if array_length(v_parts, 1) = 2 then
    if p_write then
      return v_host or (v_member and p_extension = 'presence');
    end if;
    return v_host or v_member;
  elsif v_parts[3] = 'host' then
    if p_write then
      return v_member and p_extension = 'broadcast';
    end if;
    return v_host;
  else
    if p_write then
      return v_host and p_extension = 'broadcast';
    end if;
    return private.is_room_player(v_room::text, v_parts[4]);
  end if;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_room_host(uuid) to authenticated;
grant execute on function private.is_any_host() to authenticated;
grant execute on function private.is_room_player(text, text) to authenticated;
grant execute on function private.realtime_can(text, text, boolean) to authenticated;

create policy "room topics: read"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.realtime_can((select realtime.topic()), realtime.messages.extension, false)
  );

create policy "room topics: write"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.realtime_can((select realtime.topic()), realtime.messages.extension, true)
  );

-- ---------------------------------------------------------------------------
-- Row Level Security (SRD §8).
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.submissions enable row level security;
alter table public.prompts enable row level security;

revoke all on public.rooms, public.players, public.submissions, public.prompts from anon, authenticated;
revoke all on sequence public.prompts_id_seq from anon, authenticated;

-- rooms: only the host session can read the room and update its snapshot.
grant select on public.rooms to authenticated;
grant update (status, current_game, settings, state_snapshot, last_activity) on public.rooms to authenticated;

create policy "rooms: host reads" on public.rooms
  for select to authenticated using (host_uid = (select auth.uid()));
create policy "rooms: host updates" on public.rooms
  for update to authenticated
  using (host_uid = (select auth.uid()))
  with check (host_uid = (select auth.uid()));

-- players: tokens are never selectable through the API; the host reads them
-- through host_room_players(). Players see only their own row.
grant select (id, room_id, name, color, is_vip, is_audience, score, games_won, joined_at)
  on public.players to authenticated;
grant update (is_vip, score, games_won) on public.players to authenticated;
grant delete on public.players to authenticated;

create policy "players: self or host reads" on public.players
  for select to authenticated
  using (auth_uid = (select auth.uid()) or private.is_room_host(room_id));
create policy "players: host updates" on public.players
  for update to authenticated
  using (private.is_room_host(room_id))
  with check (private.is_room_host(room_id));
create policy "players: host kicks or player leaves" on public.players
  for delete to authenticated
  using (private.is_room_host(room_id) or auth_uid = (select auth.uid()));

-- submissions: a player records their own drawings; the host reads them.
grant select, insert on public.submissions to authenticated;

create policy "submissions: player inserts own" on public.submissions
  for insert to authenticated
  with check (private.is_room_player(room_id::text, player_id::text));
create policy "submissions: host or author reads" on public.submissions
  for select to authenticated
  using (private.is_room_host(room_id) or private.is_room_player(room_id::text, player_id::text));

-- prompts hold answers and secret words, so only hosts can read them.
grant select on public.prompts to authenticated;

create policy "prompts: hosts read" on public.prompts
  for select to authenticated using (private.is_any_host());

-- ---------------------------------------------------------------------------
-- Server API (called only by Next.js route handlers, gated by the API secret).
-- ---------------------------------------------------------------------------

create or replace function public.host_room_players(p_room_id uuid)
returns setof public.players
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.players p
  where p.room_id = p_room_id and private.is_room_host(p_room_id)
  order by p.joined_at, p.id;
$$;

create or replace function public.api_create_room(
  p_secret text,
  p_ip text,
  p_host_secret text,
  p_settings jsonb
)
returns table (room_id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'BCDFGHJKLMNPQRSTVWXZ'; -- no vowels (or Y): no accidental words
  v_code text;
  v_id uuid;
  v_attempt int := 0;
begin
  perform private.assert_api_secret(p_secret);
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.hit_rate_limit('create:' || coalesce(p_ip, 'unknown'), 10, interval '1 minute') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.rooms (code, host_secret, host_uid, settings)
      values (v_code, p_host_secret, (select auth.uid()), coalesce(p_settings, '{}'::jsonb))
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 25 then
        raise exception 'no_codes_available' using errcode = 'P0001';
      end if;
    end;
  end loop;

  return query select v_id, v_code;
end;
$$;

create or replace function public.api_claim_room(p_secret text, p_code text, p_host_secret text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.assert_api_secret(p_secret);
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.rooms
     set host_uid = (select auth.uid()), last_activity = now()
   where code = upper(p_code) and host_secret = p_host_secret and status <> 'ended'
  returning id into v_id;
  if v_id is null then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- Joins a room or reconnects an existing seat by token (FR-2, FR-3, FR-8).
-- Name validation and the profanity filter run in the route handler first.
create or replace function public.api_join_room(
  p_secret text,
  p_ip text,
  p_code text,
  p_name text,
  p_reconnect_token text,
  p_new_token text,
  p_colors text[],
  p_audience_color text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_player public.players;
  v_name text;
  v_base text;
  v_suffix int := 1;
  v_seated int;
  v_audience int;
  v_is_audience boolean := false;
  v_color text;
  v_has_vip boolean;
begin
  perform private.assert_api_secret(p_secret);
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.hit_rate_limit('join:' || coalesce(p_ip, 'unknown'), 10, interval '1 minute') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select * into v_room from public.rooms r
   where r.code = upper(p_code) and r.status <> 'ended'
   for update;
  if v_room.id is null then
    raise exception 'room_not_found' using errcode = 'P0001';
  end if;

  -- Reconnect: same seat and score, rebound to this device's auth user.
  if p_reconnect_token is not null and length(p_reconnect_token) > 0 then
    update public.players p
       set auth_uid = (select auth.uid())
     where p.room_id = v_room.id and p.token = p_reconnect_token
    returning * into v_player;
    if v_player.id is not null then
      update public.rooms set last_activity = now() where id = v_room.id;
      return jsonb_build_object(
        'reconnected', true,
        'room', jsonb_build_object('id', v_room.id, 'code', v_room.code),
        'player', to_jsonb(v_player)
      );
    end if;
  end if;

  if p_name is null or char_length(p_name) < 1 or char_length(p_name) > 12 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  select count(*) filter (where not coalesce(p.is_audience, false)),
         count(*) filter (where coalesce(p.is_audience, false))
    into v_seated, v_audience
    from public.players p where p.room_id = v_room.id;

  if v_seated >= 8 then
    if coalesce((v_room.settings ->> 'audience')::boolean, true) = false then
      raise exception 'room_full' using errcode = 'P0001';
    end if;
    if v_audience >= 50 then
      raise exception 'audience_full' using errcode = 'P0001';
    end if;
    v_is_audience := true;
  end if;

  -- Duplicate names get a number suffix, trimmed to stay within 12 chars.
  v_name := p_name;
  while exists (
    select 1 from public.players p where p.room_id = v_room.id and lower(p.name) = lower(v_name)
  ) loop
    v_suffix := v_suffix + 1;
    v_base := left(p_name, 12 - char_length(v_suffix::text));
    v_name := v_base || v_suffix::text;
  end loop;

  if v_is_audience then
    v_color := p_audience_color;
  else
    select c into v_color
      from unnest(p_colors) with ordinality as t(c, ord)
     where not exists (
       select 1 from public.players p
        where p.room_id = v_room.id and not coalesce(p.is_audience, false) and p.color = t.c
     )
     order by ord
     limit 1;
    v_color := coalesce(v_color, p_colors[1]);
  end if;

  v_has_vip := exists (select 1 from public.players p where p.room_id = v_room.id and p.is_vip);

  insert into public.players (room_id, auth_uid, name, color, token, is_vip, is_audience)
  values (
    v_room.id, (select auth.uid()), v_name, v_color, p_new_token,
    (not v_is_audience and not v_has_vip), v_is_audience
  )
  returning * into v_player;

  update public.rooms set last_activity = now() where id = v_room.id;

  return jsonb_build_object(
    'reconnected', false,
    'room', jsonb_build_object('id', v_room.id, 'code', v_room.code),
    'player', to_jsonb(v_player)
  );
end;
$$;

revoke all on function public.host_room_players(uuid) from public, anon;
revoke all on function public.api_create_room(text, text, text, jsonb) from public, anon;
revoke all on function public.api_claim_room(text, text, text) from public, anon;
revoke all on function public.api_join_room(text, text, text, text, text, text, text[], text) from public, anon;
grant execute on function public.host_room_players(uuid) to authenticated;
grant execute on function public.api_create_room(text, text, text, jsonb) to authenticated;
grant execute on function public.api_claim_room(text, text, text) to authenticated;
grant execute on function public.api_join_room(text, text, text, text, text, text, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: drawings are PNGs under 200 KB at drawings/{roomId}/{playerId}/*.png
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drawings', 'drawings', true, 204800, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "drawings: players upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drawings'
    and private.is_room_player((storage.foldername(name))[1], (storage.foldername(name))[2])
  );
