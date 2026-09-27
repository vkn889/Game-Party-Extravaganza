# Game Party Extravaganza

A browser-based party game platform: one computer hosts, 2 to 8 players join from their phones with a 4-letter room code, and up to 50 more people can join as the audience. 15 original games, no app install, no accounts.

- **Host:** open `/host` on a laptop or TV. It shows the room code (120 px), a QR code to `/join?code=XXXX`, and the stage.
- **Players:** open `/join`, type the code and a name, and play from `/play/XXXX`.

## Features beyond a single game

- **Tournament mode:** the VIP switches the lobby to *Tournament*, picks games in order (or *Random 5*), and starts. Games run back to back with a 20-second break (the VIP can start the next one early or end the tournament). Each game awards placement points (1st place earns one point per player, and so on down), and the top total is crowned champion. Tournaments survive a host refresh.
- **Music:** five tracks in `public/music` loop on the host screen through the lobby, every game and the results. The host picks the track and volume in Settings; sound effects stay synthesized.
- **Color schemes:** the host picks a preset (Classic, Ocean, Sunset, Forest, Midnight, Candy) or edits each of the five colors in Settings. Every phone in the room follows the host's scheme live. Presets are tested for WCAG AA contrast; custom colors show a warning when text may be hard to read.

## Stack

Next.js 15 (App Router, TypeScript, Tailwind CSS 4) on Vercel, with Supabase for Realtime (Broadcast + Presence), Postgres, Storage and anonymous auth. The **host browser is the single source of truth**: phones send actions to the host over Realtime, and the host validates them, runs the game, and broadcasts the results (SRD §5).

```
app/                     pages and API routes (/, /host, /join, /play/[code], /api/rooms, /api/rooms/join, /api/rooms/claim, /api/time)
lib/engine/              pure helpers: timers, scoring, House player, profanity filter, text matching, RNG
lib/realtime/            hostEngine.ts (the authoritative room engine), transports, React hooks
lib/supabase/            browser client (host), lite client (phones), server helpers (routes)
games/<slug>/            one folder per game: logic.ts (pure), HostView, ControllerView, tests
games/registry.ts        all 15 GameModules (host); games/controllers.tsx code-splits phone controllers
components/              shared UI (Timer, VoteGrid, DrawingCanvas, Avatar, Scoreboard, WaitingScreen), host and phone shells
content/prompts/*.json   prompt packs (seeded into the prompts table)
supabase/                migrations, seed.sql, config.toml, functions/cleanup-rooms
tests/e2e/               Playwright specs; load/k6-rooms.js for load testing
```

## Setup

1. **Install:** `npm install` (Node 22+).
2. **Supabase project.** Apply `supabase/migrations/*` (`supabase db push`, or run them in order in the SQL editor). Then in the dashboard:
   - **Authentication → Sign In / Providers:** enable **Allow anonymous sign-ins** (required; every device signs in anonymously).
   - **Authentication → Rate Limits:** raise **anonymous sign-ins** well above the default (a whole party, plus up to 50 audience members, often shares one Wi-Fi IP).
   - **Realtime → Settings:** turn off **Allow public access** so only private, authorized channels work.
3. **Secrets in the database:**
   ```sql
   insert into private.app_secrets (name, value) values
     ('api', '<same value as GPE_API_SECRET>'),
     ('project_url', 'https://<project-ref>.supabase.co');
   ```
   (`cleanup` is generated automatically by the cron migration.)
4. **Environment:** copy `.env.example` to `.env.local` and fill in the URL, publishable key and `GPE_API_SECRET`. Add the same variables in Vercel.
5. **Prompts:** `npm run seed:push` (or `npm run seed:sql` and run `supabase/seed.sql`).
6. **Cleanup function:** `supabase functions deploy cleanup-rooms --no-verify-jwt` (it authenticates with its own token; see below).
7. `npm run dev`, open `http://localhost:3000/host` on one screen and `/join` on phones.

## Security model (SRD §8)

- **Anonymous auth** gives every device a user id for RLS and Realtime Authorization.
- **Realtime Authorization** (`private.realtime_can`): members read `room:{code}`, only the host broadcasts on it; members may only *send* on `room:{code}:host` and only the host reads it; `room:{code}:p:{id}` is readable only by that player and writable only by the host.
- **RLS:** only the host reads its room and updates `state_snapshot`; player tokens are never selectable (column grants), and the host reads them through `host_room_players()`. Prompts (which contain answers) are readable only by hosts.
- **Route handlers** call secret-gated RPCs (`api_create_room`, `api_join_room`, `api_claim_room`) as the calling device, so the RPCs can't be called from a browser directly. No service-role key is needed by the app.
- **Host validation:** token, membership, phase, one submission per step, 5 actions per second per player. `publicView` is unit-tested never to include secrets.
- **Rate limits:** 10 joins and 10 room creations per minute per IP (reconnects have a separate, larger bucket because a party shares an IP).
- **Content:** names are always profanity-filtered; player text is filtered when family-friendly mode is on.

## Requirement traceability

| ID | Where |
| --- | --- |
| FR-1 room + code + QR | `api_create_room` (consonant-only codes), `components/host/Lobby.tsx` |
| FR-2 join, lobby within 1 s | `app/api/rooms/join`, presence-driven lobby in `hostEngine.handlePresence` |
| FR-3 VIP + handover | `api_join_room` (first seat), `hostEngine.ensureVip` |
| FR-4 VIP selects/starts | `components/phone/PhoneLobby.tsx`, `hostEngine.selectGame/startGame` |
| FR-5 2–8 players + small-group rules | `games/meta.ts`, each `logic.ts` (House player in `lib/engine/house.ts`) |
| FR-6 private channel data | `privateView` + `sendPrivate` on `room:{code}:p:{id}` |
| FR-7 synced timers, auto-advance | `lib/engine/timers.ts` (`/api/time` clock sync), `isStepComplete` |
| FR-8 reconnect by token (5 min) | `lib/realtime/storage.ts`, `useRoomChannel`, `RECONNECT_GRACE_MS` |
| FR-9 host refresh restore | `hostEngine.snapshot/restore`, `api_claim_room` |
| FR-10 pause below 2 | `hostEngine.syncGameConnectivity` |
| FR-11 drawing canvas | `components/shared/DrawingCanvas.tsx` (6 colors, 3 sizes, undo, clear, PNG < 200 KB) |
| FR-12 family-friendly filter | `lib/engine/filter.ts`, prompts `family_friendly` |
| FR-13 kick + skip | `VIP_KICK`, `VIP_SKIP` |
| FR-14 audience (50) | `api_join_room`, `AudienceView`, combined bonus vote in `hostEngine.advance` |
| FR-15 session leaderboard | `games_won`, `components/host/Results.tsx` |
| FR-16 host settings | `components/host/SettingsPanel.tsx` (timers, audience, music track and volume, SFX, color scheme), `lib/audio.ts`, `lib/theme.ts` |
| Tournament mode | `hostEngine.startTournament`, `components/phone/PhoneLobby.tsx`, `components/host/Results.tsx` |
| NFR-2 `/play` < 200 KB gz | phones skip Framer Motion and full supabase-js (`lib/supabase/lite.ts`); controllers are code-split |
| NFR-6 4 h room lifetime | `supabase/functions/cleanup-rooms` + `pg_cron` every 30 min |

## Testing

- `npm test`: Vitest. Game logic for all 15 games (including 2-player rules and secrecy of `publicView`), the host engine (timers, pause, VIP, reconnection grace, snapshots, audience, rate limits), and React Testing Library renders of every host and controller phase.
- `npm run test:e2e`: Playwright against a real Supabase project (`npm run build` first). One host plus 2 and 8 phone contexts play each game to results; lobby, audience, kick, phone and host refresh.
- `k6 run load/k6-rooms.js`: realtime load test (see the header for parameters and IP rate-limit notes).

## Open questions from the PRD

Decisions taken for v1 (easy to change): music and SFX ship now (five music tracks plus synthesized SFX, host only, volume sliders); drawings are not moderated; prompt packs ship with 20–150 prompts per game (793 total) and grow by editing `content/prompts`; no streamer mode; no single-screen mode.
