/**
 * Load test (SRD §8, NFR-1, NFR-3): ROOMS rooms x PLAYERS phones sending
 * actions to a listening host over Supabase Realtime, using the real API
 * routes and the real private-channel topology (room:{code}:host).
 *
 *   k6 run -e APP_URL=https://your-app.vercel.app \
 *          -e SUPABASE_URL=https://<ref>.supabase.co -e SUPABASE_KEY=<publishable key> \
 *          -e ROOMS=500 -e PLAYERS=8 -e DURATION=3m load/k6-rooms.js
 *
 * Setup creates every room and seat through /api/rooms and /api/rooms/join,
 * which are rate limited per IP (10 joins/minute) and Supabase limits
 * anonymous sign-ins per IP. Run full-size tests from k6 Cloud (many IPs) or
 * against a staging project with those limits raised. Defaults are a smoke test.
 */
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';
import ws from 'k6/ws';

const APP_URL = __ENV.APP_URL || 'http://localhost:3000';
const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_KEY = __ENV.SUPABASE_KEY;
const ROOMS = Number(__ENV.ROOMS || 2);
const PLAYERS = Number(__ENV.PLAYERS || 2);
const DURATION = __ENV.DURATION || '60s';
const ACTIONS_PER_SECOND = Number(__ENV.ACTIONS_PER_SECOND || 1);

const latency = new Trend('action_to_host_ms', true);
const received = new Counter('actions_received');
const sent = new Counter('actions_sent');

export const options = {
  setupTimeout: '30m',
  scenarios: {
    hosts: { executor: 'per-vu-iterations', vus: ROOMS, iterations: 1, maxDuration: '30m', exec: 'host' },
    phones: { executor: 'per-vu-iterations', vus: ROOMS * PLAYERS, iterations: 1, maxDuration: '30m', exec: 'phone', startTime: '5s' },
  },
  thresholds: {
    action_to_host_ms: ['p(95)<200'], // NFR-1
    checks: ['rate>0.99'],
  },
};

function anonSession() {
  const res = http.post(`${SUPABASE_URL}/auth/v1/signup`, '{}', {
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
  });
  check(res, { 'anonymous sign-in': (r) => r.status === 200 });
  return res.json('access_token');
}

function api(path, token, body) {
  const res = http.post(`${APP_URL}${path}`, JSON.stringify(body), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  check(res, { [`${path} ok`]: (r) => r.status === 200 || r.status === 201 });
  return res.json();
}

export function setup() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_KEY');
  const rooms = [];
  for (let r = 0; r < ROOMS; r++) {
    const hostToken = anonSession();
    const room = api('/api/rooms', hostToken, {});
    const players = [];
    for (let p = 0; p < PLAYERS; p++) {
      const token = anonSession();
      const joined = api('/api/rooms/join', token, { code: room.code, name: `Load${p + 1}` });
      players.push({ jwt: token, id: joined.player.id, seatToken: joined.player.token });
    }
    rooms.push({ code: room.code, hostJwt: hostToken, players });
  }
  return { rooms };
}

function socketUrl() {
  return `${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`;
}

function joinMessage(topic, jwt, ref) {
  return JSON.stringify({
    topic: `realtime:${topic}`,
    event: 'phx_join',
    payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, private: true }, access_token: jwt },
    ref: String(ref),
    join_ref: String(ref),
  });
}

function heartbeat(socket, ref) {
  socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref) }));
}

const durationMs = () => {
  const m = /^(\d+)(ms|s|m)$/.exec(DURATION);
  if (!m) return 60_000;
  return Number(m[1]) * (m[2] === 'm' ? 60_000 : m[2] === 's' ? 1000 : 1);
};

/** One listening host per room, like the host browser on room:{code}:host. */
export function host(data) {
  const room = data.rooms[(__VU - 1) % data.rooms.length];
  const res = ws.connect(socketUrl(), {}, (socket) => {
    let ref = 1;
    socket.on('open', () => socket.send(joinMessage(`room:${room.code}:host`, room.hostJwt, ref++)));
    socket.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.event === 'phx_reply' && msg.payload.status !== 'ok') check(null, { 'host joined channel': () => false });
      if (msg.event === 'broadcast' && msg.payload?.event === 'action') {
        const sentAt = msg.payload.payload?.payload?.sentAt;
        if (sentAt) latency.add(Date.now() - sentAt);
        received.add(1);
      }
    });
    socket.setInterval(() => heartbeat(socket, ref++), 25_000);
    socket.setTimeout(() => socket.close(), durationMs() + 15_000);
  });
  check(res, { 'host socket opened': (r) => r && r.status === 101 });
}

/** A phone sending SUBMIT actions to its room's host. */
export function phone(data) {
  const index = __VU - 1;
  const room = data.rooms[Math.floor(index / PLAYERS) % data.rooms.length];
  const seat = room.players[index % PLAYERS];
  const topic = `realtime:room:${room.code}:host`;
  const res = ws.connect(socketUrl(), {}, (socket) => {
    let ref = 1;
    let joined = false;
    socket.on('open', () => socket.send(joinMessage(`room:${room.code}:host`, seat.jwt, ref++)));
    socket.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.event === 'phx_reply' && msg.topic === topic) {
        joined = msg.payload.status === 'ok';
        check(joined, { 'phone joined channel': (ok) => ok });
      }
    });
    socket.setInterval(() => {
      if (!joined) return;
      socket.send(
        JSON.stringify({
          topic,
          event: 'broadcast',
          payload: {
            type: 'broadcast',
            event: 'action',
            payload: { type: 'SUBMIT', playerId: seat.id, token: seat.seatToken, round: 0, payload: { loadtest: true, sentAt: Date.now() } },
          },
          ref: String(ref++),
        }),
      );
      sent.add(1);
    }, 1000 / ACTIONS_PER_SECOND);
    socket.setInterval(() => heartbeat(socket, ref++), 25_000);
    socket.setTimeout(() => socket.close(), durationMs());
  });
  check(res, { 'phone socket opened': (r) => r && r.status === 101 });
  sleep(1);
}
