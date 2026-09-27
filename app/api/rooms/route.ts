import { normalizeSettings } from '@/lib/settings';
import {
  apiSecret,
  bearerToken,
  clientIp,
  createUserClient,
  jsonError,
  randomToken,
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** POST /api/rooms: create a room with a unique 4-letter code (FR-1). */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError(401, 'not_authenticated', 'Sign-in required.');
  const body = (await request.json().catch(() => ({}))) as { settings?: unknown };
  const settings = normalizeSettings(body.settings);
  const hostSecret = randomToken(32);

  const supabase = createUserClient(token);
  const { data, error } = await supabase.rpc('api_create_room', {
    p_secret: apiSecret(),
    p_ip: clientIp(request),
    p_host_secret: hostSecret,
    p_settings: settings,
  });
  if (error) {
    if (error.message.includes('rate_limited')) {
      return jsonError(429, 'rate_limited', 'Too many rooms created. Try again in a minute.');
    }
    if (error.message.includes('not_authenticated') || error.code === 'PGRST301') {
      return jsonError(401, 'not_authenticated', 'Sign-in required.');
    }
    console.error('[api/rooms]', error);
    return jsonError(500, 'server_error', 'Could not create a room.');
  }
  const row = (Array.isArray(data) ? data[0] : data) as { room_id: string; room_code: string } | undefined;
  if (!row) return jsonError(500, 'server_error', 'Could not create a room.');
  return Response.json(
    { roomId: row.room_id, code: row.room_code, hostSecret, settings },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
