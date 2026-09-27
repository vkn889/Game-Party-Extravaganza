import { AUDIENCE_COLOR, AVATAR_COLORS } from '@/lib/palette';
import { validateName } from '@/lib/engine/filter';
import { isRoomCode, normalizeCode } from '@/lib/room-code';
import {
  apiSecret,
  bearerToken,
  clientIp,
  createUserClient,
  jsonError,
  randomToken,
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, [number, string]> = {
  room_not_found: [404, 'No room with that code. Check the code on the big screen.'],
  rate_limited: [429, 'Too many join attempts. Wait a minute and try again.'],
  seat_expired: [410, 'Your seat expired. Join again with your name.'],
  invalid_name: [400, 'Names are 1 to 12 characters.'],
  room_full: [409, 'This room is full.'],
  audience_full: [409, 'This room and its audience are full.'],
};

interface PlayerRow {
  id: string;
  name: string;
  color: string;
  token: string;
  is_vip: boolean;
  is_audience: boolean;
  score: number;
  games_won: number;
}

/** POST /api/rooms/join: join by code + name, or reconnect by token (FR-2, FR-8). */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return jsonError(401, 'not_authenticated', 'Sign-in required.');
  const body = (await request.json().catch(() => ({}))) as { code?: unknown; name?: unknown; token?: unknown };

  const code = normalizeCode(body.code);
  if (!isRoomCode(code)) return jsonError(400, 'invalid_code', 'Room codes are 4 letters.');

  const reconnectToken = typeof body.token === 'string' && body.token.length > 0 ? body.token : null;
  let name: string | null = null;
  if (body.name != null && body.name !== '') {
    const check = validateName(body.name);
    if (!check.ok) return jsonError(400, 'invalid_name', check.error);
    name = check.name;
  } else if (!reconnectToken) {
    return jsonError(400, 'invalid_name', 'Enter a name.');
  }

  const supabase = createUserClient(token);
  const { data, error } = await supabase.rpc('api_join_room', {
    p_secret: apiSecret(),
    p_ip: clientIp(request),
    p_code: code,
    p_name: name,
    p_reconnect_token: reconnectToken,
    p_new_token: randomToken(24),
    p_colors: [...AVATAR_COLORS],
    p_audience_color: AUDIENCE_COLOR,
  });
  if (error) {
    if (error.message.includes('not_authenticated')) return jsonError(401, 'not_authenticated', 'Sign-in required.');
    console.error('[api/rooms/join]', error);
    return jsonError(500, 'server_error', 'Could not join the room.');
  }
  const result = data as { error?: string; reconnected?: boolean; room?: { id: string; code: string }; player?: PlayerRow };
  if (result.error) {
    const [status, message] = ERRORS[result.error] ?? [400, 'Could not join the room.'];
    return jsonError(status, result.error, message);
  }
  const player = result.player!;
  return Response.json(
    {
      reconnected: result.reconnected,
      room: { id: result.room!.id, code: result.room!.code.trim() },
      player: {
        id: player.id,
        name: player.name,
        color: player.color,
        token: player.token,
        isVip: player.is_vip,
        isAudience: player.is_audience,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
