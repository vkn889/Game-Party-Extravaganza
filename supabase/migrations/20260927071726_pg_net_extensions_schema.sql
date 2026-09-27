-- Keep pg_net out of the public schema (Supabase security advisor 0014).
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
