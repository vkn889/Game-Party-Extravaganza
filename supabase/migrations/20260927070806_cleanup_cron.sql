-- Room cleanup every 30 minutes (SRD §8, NFR-6): pg_cron calls the
-- cleanup-rooms Edge Function through pg_net. The function authenticates the
-- call with a random token kept in private.app_secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

insert into private.app_secrets (name, value)
values ('cleanup', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function public.cleanup_token_valid(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.app_secrets where name = 'cleanup' and value = p_token);
$$;

revoke all on function public.cleanup_token_valid(text) from public, anon, authenticated;
grant execute on function public.cleanup_token_valid(text) to service_role;

-- The project URL lives in private.app_secrets('project_url'); set it once per project:
--   insert into private.app_secrets values ('project_url', 'https://<ref>.supabase.co');
create or replace function private.invoke_cleanup()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select value from private.app_secrets where name = 'project_url') || '/functions/v1/cleanup-rooms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-token', (select value from private.app_secrets where name = 'cleanup')
    ),
    body := '{}'::jsonb
  );
$$;

select cron.schedule('cleanup-rooms', '*/30 * * * *', $$ select private.invoke_cleanup(); $$);
select cron.schedule('prune-rate-limits', '15 * * * *', $$ delete from private.rate_limits where window_start < now() - interval '1 hour'; $$);
