-- Everyone at a party usually shares one Wi-Fi IP, so reconnects (phone sleep,
-- refresh) get their own, roomier bucket instead of eating into the
-- 10-per-minute join limit (SRD §8). Business errors are returned rather than
-- raised so the rate-limit counters are not rolled back with the transaction.
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

  select * into v_room from public.rooms r
   where r.code = upper(p_code) and r.status <> 'ended'
   for update;
  if v_room.id is null then
    if not private.hit_rate_limit('join:' || coalesce(p_ip, 'unknown'), 10, interval '1 minute') then
      return jsonb_build_object('error', 'rate_limited');
    end if;
    return jsonb_build_object('error', 'room_not_found');
  end if;

  -- Reconnect: same seat and score, rebound to this device's auth user (FR-8).
  if p_reconnect_token is not null and length(p_reconnect_token) > 0 then
    if not private.hit_rate_limit('rejoin:' || coalesce(p_ip, 'unknown'), 120, interval '1 minute') then
      return jsonb_build_object('error', 'rate_limited');
    end if;
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
    if p_name is null then
      return jsonb_build_object('error', 'seat_expired');
    end if;
  end if;

  if not private.hit_rate_limit('join:' || coalesce(p_ip, 'unknown'), 10, interval '1 minute') then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  if p_name is null or char_length(p_name) < 1 or char_length(p_name) > 12 then
    return jsonb_build_object('error', 'invalid_name');
  end if;

  select count(*) filter (where not coalesce(p.is_audience, false)),
         count(*) filter (where coalesce(p.is_audience, false))
    into v_seated, v_audience
    from public.players p where p.room_id = v_room.id;

  if v_seated >= 8 then
    if coalesce((v_room.settings ->> 'audience')::boolean, true) = false then
      return jsonb_build_object('error', 'room_full');
    end if;
    if v_audience >= 50 then
      return jsonb_build_object('error', 'audience_full');
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
