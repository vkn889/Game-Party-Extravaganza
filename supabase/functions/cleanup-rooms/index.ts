// Deletes rooms idle for 4+ hours, their drawings in Storage, and stale
// anonymous auth users (NFR-6, NFR-7). Invoked every 30 minutes by pg_cron.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ROOM_TTL_MS = 4 * 60 * 60 * 1000;
const ANON_USER_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  return keys.default ?? Object.values(keys)[0] ?? '';
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });

  // Only the cron job knows the cleanup token (stored in private.app_secrets).
  const token = req.headers.get('x-cleanup-token') ?? '';
  const { data: valid } = await admin.rpc('cleanup_token_valid', { p_token: token });
  if (valid !== true) return new Response('Unauthorized', { status: 401 });

  const cutoff = new Date(Date.now() - ROOM_TTL_MS).toISOString();
  const { data: rooms, error } = await admin.from('rooms').select('id').lt('last_activity', cutoff).limit(BATCH);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let files = 0;
  for (const room of rooms ?? []) {
    const { data: folders } = await admin.storage.from('drawings').list(room.id, { limit: 1000 });
    for (const folder of folders ?? []) {
      const prefix = `${room.id}/${folder.name}`;
      const { data: objects } = await admin.storage.from('drawings').list(prefix, { limit: 1000 });
      const paths = (objects ?? []).map((o) => `${prefix}/${o.name}`);
      if (paths.length) {
        await admin.storage.from('drawings').remove(paths);
        files += paths.length;
      }
    }
  }
  const ids = (rooms ?? []).map((r) => r.id);
  if (ids.length) await admin.from('rooms').delete().in('id', ids); // players and submissions cascade

  // Anonymous users idle for a day who no longer host or sit in any room.
  const [{ data: hosts }, { data: seats }] = await Promise.all([
    admin.from('rooms').select('host_uid'),
    admin.from('players').select('auth_uid'),
  ]);
  const inUse = new Set([...(hosts ?? []).map((h) => h.host_uid), ...(seats ?? []).map((s) => s.auth_uid)]);
  const staleBefore = Date.now() - ANON_USER_TTL_MS;
  let users = 0;
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const list = data?.users ?? [];
    for (const u of list) {
      const last = Date.parse(u.last_sign_in_at ?? u.created_at);
      if (u.is_anonymous && last < staleBefore && !inUse.has(u.id)) {
        const { error: delError } = await admin.auth.admin.deleteUser(u.id);
        if (!delError) users++;
      }
    }
    if (list.length < 1000) break;
  }

  return Response.json({ rooms: ids.length, files, users });
});
