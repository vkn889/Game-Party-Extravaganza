-- Realtime only lets a client join a channel it can read. The host writes
-- private views to room:{code}:p:{id}, so it may also read those topics.
-- Phones still cannot read room:{code}:host; they send actions to it over the
-- HTTP broadcast endpoint, which only checks the write policy.
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
  select r.id, r.host_uid = (select auth.uid()) into v_room, v_host from public.rooms r where r.code = v_parts[2];
  if v_room is null then
    return false;
  end if;
  v_member := exists (select 1 from public.players p where p.room_id = v_room and p.auth_uid = (select auth.uid()));
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
    return v_host or private.is_room_player(v_room::text, v_parts[4]);
  end if;
end;
$$;
