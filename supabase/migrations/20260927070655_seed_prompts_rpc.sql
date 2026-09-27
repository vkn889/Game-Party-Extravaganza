-- Lets scripts/seed-prompts.mjs --push replace the prompt packs over HTTPS.
-- Gated by the same server API secret as the room RPCs.
create or replace function public.api_seed_prompts(p_secret text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.assert_api_secret(p_secret);
  delete from public.prompts where true; -- explicit filter keeps pg-safeupdate happy
  insert into public.prompts (game, text, answer, decoys, family_friendly)
  select x.game, x.text, x.answer, x.decoys, coalesce(x.family_friendly, true)
    from jsonb_to_recordset(p_rows) as x(game text, text text, answer text, decoys text[], family_friendly boolean);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.api_seed_prompts(text, jsonb) from public;
grant execute on function public.api_seed_prompts(text, jsonb) to anon, authenticated;
