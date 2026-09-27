'use client';

import { m } from 'framer-motion';
import { Trophy, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Avatar } from '@/components/shared/Avatar';
import { GameIcon } from '@/components/shared/GameIcon';
import { GAME_META } from '@/games/meta';
import type { RoomPublic } from '@/lib/types';

/** Lobby stage: 120 px room code, QR to /join?code=XXXX, and who's in (PRD §2). */
export function Lobby({ room, joinUrl, loading, error }: { room: RoomPublic; joinUrl: string; loading: boolean; error: string | null }) {
  const selected = room.selectedGame ? GAME_META[room.selectedGame] : null;
  const vip = room.players.find((p) => p.id === room.vipId);
  const origin = joinUrl.replace(/\/join.*$/, '');
  const leaders = room.leaderboard.filter((l) => l.gamesWon > 0);
  return (
    <div className="grid w-full flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-10">
      <section className="flex flex-col items-center justify-center gap-6 rounded-[2.5rem] bg-plum-raised p-10 shadow-card" aria-label="How to join">
        <p className="font-display text-3xl font-semibold text-mint">Join on your phone</p>
        <p className="text-2xl">
          Go to <span className="font-display font-bold">{origin.replace(/^https?:\/\//, '')}/join</span>
        </p>
        <p className="font-display stage-code font-bold tracking-[0.12em] text-peach" aria-label={`Room code ${room.code.split('').join(' ')}`}>
          {room.code}
        </p>
        <div className="rounded-3xl bg-peach p-4">
          <QRCodeSVG value={joinUrl} size={220} bgColor={room.settings.theme.peach} fgColor={room.settings.theme.plum} level="M" aria-label="QR code to join this room" />
        </div>
        <p className="text-xl text-peach/85">or scan to join. 2 to 8 players, audience after that.</p>
      </section>

      <section className="flex flex-col gap-6" aria-label="Players">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-4xl font-bold">
            Players <span className="text-peach/70">{room.players.length}/8</span>
          </h2>
          {room.audienceCount > 0 && (
            <span className="flex items-center gap-2 text-xl text-mint">
              <Users aria-hidden className="h-6 w-6" /> {room.audienceCount} in the audience
            </span>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-4">
          {room.players.map((p, i) => (
            <m.li
              key={p.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', delay: i * 0.04 }}
              className="flex items-center gap-4 rounded-2xl bg-plum-raised px-5 py-4"
            >
              <Avatar name={p.name} color={p.color} size="lg" vip={p.isVip} dimmed={!p.connected} />
              <span className="flex flex-col">
                <span className="font-display text-3xl font-semibold">{p.name}</span>
                <span className="text-lg text-peach/75">{!p.connected ? 'Reconnecting…' : p.isVip ? 'VIP' : 'Ready'}</span>
              </span>
            </m.li>
          ))}
          {Array.from({ length: Math.max(0, 2 - room.players.length) }, (_, i) => (
            <li key={`empty-${i}`} className="flex items-center justify-center rounded-2xl border-2 border-dashed border-peach/30 px-5 py-6 text-xl text-peach/60">
              Waiting for a player…
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-col gap-4 rounded-3xl bg-plum-deep p-6">
          {selected ? (
            <div className="flex items-center gap-5">
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-purple text-peach">
                <GameIcon slug={selected.slug} className="h-11 w-11" />
              </span>
              <div>
                <p className="font-display text-4xl font-bold">{selected.name}</p>
                <p className="text-xl text-peach/85">
                  {selected.tagline} · about {selected.minutes} min
                </p>
              </div>
            </div>
          ) : (
            <p className="font-display text-3xl font-semibold">
              {vip ? `${vip.name} is picking a game…` : 'The first player to join becomes the VIP and picks the game.'}
            </p>
          )}
          {loading && <p className="text-xl text-mint">Loading the game…</p>}
          {error && (
            <p role="alert" className="text-xl font-semibold text-pink">
              {error}
            </p>
          )}
        </div>

        {leaders.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 text-xl">
            <Trophy aria-hidden className="h-6 w-6 text-pink" />
            {leaders.map((l) => (
              <span key={l.id} className="flex items-center gap-2">
                <Avatar name={l.name} color={l.color} size="sm" /> {l.name} × {l.gamesWon}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
