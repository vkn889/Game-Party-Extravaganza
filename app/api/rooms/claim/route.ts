import { apiSecret, bearerToken, createUserClient, jsonError } from '@/lib/supabase/server';
import { isRoomCode, normalizeCode } from '@/lib/room-code';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rooms/claim: a refreshed host browser that lost its auth session
 * proves it is the host with the stored host secret and takes the room back.
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError(401, 'not_authenticated', 'Sign-in required.');
  const body = (await request.json().catch(() => ({}))) as { code?: unknown; hostSecret?: unknown };
  const code = normalizeCode(body.code);
  if (!isRoomCode(code) || typeof body.hostSecret !== 'string') {
    return jsonError(400, 'invalid_request', 'Missing room code or host secret.');
  }
  const supabase = createUserClient(token);
  const { data, error } = await supabase.rpc('api_claim_room', {
    p_secret: apiSecret(),
    p_code: code,
    p_host_secret: body.hostSecret,
  });
  if (error) {
    if (error.message.includes('room_not_found')) {
      return jsonError(404, 'room_not_found', 'That room has ended.');
    }
    console.error('[api/rooms/claim]', error);
    return jsonError(500, 'server_error', 'Could not reclaim the room.');
  }
  return Response.json({ roomId: data, code }, { headers: { 'Cache-Control': 'no-store' } });
}
