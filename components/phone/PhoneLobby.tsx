'use client';

import { Shuffle, Trophy, UserX } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import { GameIcon } from '@/components/shared/GameIcon';
import { GAME_LIST, GAME_META, unsupportedReason } from '@/games/meta';
import type { VipAction } from '@/lib/realtime/useRoomChannel';
import type { GameSlug, RoomPublic } from '@/lib/types';

/**
 * The lobby on a phone. The VIP picks and starts the game (FR-4) and can kick
 * players (FR-13); games the current player count can't support are greyed out
 * with the reason.
 */
export function PhoneLobby({ room, me, sendVip, onLeave }: { room: RoomPublic; me: string; sendVip: (a: VipAction) => void; onLeave: () => void }) {
  const isVip = room.vipId === me;
  const vip = room.players.find((p) => p.id === room.vipId);
  const connected = room.players.filter((p) => p.connected).length;
  const selected = room.selectedGame ? GAME_META[room.selectedGame] : null;
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const [tournament, setTournament] = useState(false);
  const [picks, setPicks] = useState<GameSlug[]>([]);
  const playable = GAME_LIST.filter((g) => !unsupportedReason(g, connected)).map((g) => g.slug);

  function togglePick(slug: GameSlug) {
    setPicks((list) => (list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]));
  }

  function randomPicks() {
    const pool = [...playable];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setPicks(pool.slice(0, 5));
  }

  if (!isVip) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl bg-plum-raised p-4">
          <p className="font-display text-2xl font-bold">You&apos;re in!</p>
          <p className="text-peach/85">{vip ? `${vip.name} is the VIP and will pick a game.` : 'Waiting for a VIP…'}</p>
        </div>
        {selected && (
          <div className="flex flex-col gap-2 rounded-2xl bg-peach p-4 text-plum">
            <p className="font-display flex items-center gap-2 text-2xl font-bold">
              <GameIcon slug={selected.slug} /> {selected.name}
            </p>
            <p>{selected.howToPlay}</p>
          </div>
        )}
        <PlayerList room={room} />
        <Button variant="ghost" onClick={onLeave}>
          Leave room
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-pink px-4 py-3 text-plum">
        <p className="font-display text-xl font-bold">You&apos;re the VIP!</p>
        <p>{tournament ? 'Pick games in the order you want to play them.' : 'Pick a game and start when everyone’s in.'}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-plum-deep p-1" role="radiogroup" aria-label="Mode">
        {[
          { value: false, label: 'Single game' },
          { value: true, label: 'Tournament' },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={tournament === o.value}
            onClick={() => setTournament(o.value)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold ${tournament === o.value ? 'bg-purple text-peach' : 'text-peach/80'}`}
          >
            {o.value && <Trophy aria-hidden className="h-4 w-4" />} {o.label}
          </button>
        ))}
      </div>
      {tournament && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-peach/85">Several games in a row. Placement points add up; top total wins.</span>
          <button type="button" onClick={randomPicks} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 font-semibold ring-1 ring-peach/40">
            <Shuffle aria-hidden className="h-4 w-4" /> Random 5
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-3" aria-label="Games">
        {GAME_LIST.map((meta) => {
          const reason = unsupportedReason(meta, connected);
          const order = picks.indexOf(meta.slug);
          const active = tournament ? order >= 0 : room.selectedGame === meta.slug;
          return (
            <li key={meta.slug}>
              <button
                type="button"
                disabled={Boolean(reason)}
                aria-pressed={active}
                onClick={() => (tournament ? togglePick(meta.slug) : sendVip({ type: 'VIP_SELECT_GAME', game: meta.slug }))}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors duration-200 disabled:cursor-not-allowed ${
                  active ? 'bg-pink text-plum' : reason ? 'bg-plum-deep text-peach/60' : 'bg-plum-raised hover:bg-purple'
                }`}
              >
                {tournament && order >= 0 ? (
                  <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-lg font-bold text-peach">{order + 1}</span>
                ) : (
                  <GameIcon slug={meta.slug} className="h-8 w-8 shrink-0" />
                )}
                <span className="flex flex-1 flex-col">
                  <span className="font-display text-lg font-bold">{meta.name}</span>
                  <span className="text-sm opacity-85">{reason ?? `${meta.tagline} · ${meta.minutes} min`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-3 flex flex-col gap-2">
        {tournament ? (
          <Button
            size="lg"
            block
            disabled={picks.length < 2 || picks.some((p) => !playable.includes(p))}
            onClick={() => sendVip({ type: 'VIP_START_TOURNAMENT', games: picks })}
          >
            {picks.length < 2 ? 'Pick at least 2 games' : `Start tournament (${picks.length} games)`}
          </Button>
        ) : (
          <Button size="lg" block disabled={!selected || Boolean(selected && unsupportedReason(selected, connected))} onClick={() => sendVip({ type: 'VIP_START' })}>
            {selected ? `Start ${selected.name}` : 'Pick a game'}
          </Button>
        )}
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="font-display text-xl font-bold">Players</h3>
        {room.players
          .filter((p) => p.id !== me)
          .map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-plum-raised px-3 py-2">
              <Avatar name={p.name} color={p.color} size="sm" dimmed={!p.connected} />
              <span className="flex-1 truncate">{p.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (confirmKick === p.id) {
                    sendVip({ type: 'VIP_KICK', targetId: p.id });
                    setConfirmKick(null);
                  } else setConfirmKick(p.id);
                }}
                className={`flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold ${confirmKick === p.id ? 'bg-pink text-plum' : 'ring-1 ring-peach/40'}`}
              >
                <UserX aria-hidden className="h-4 w-4" /> {confirmKick === p.id ? 'Tap to confirm' : 'Kick'}
              </button>
            </div>
          ))}
      </section>
      <Button variant="ghost" onClick={onLeave}>
        Leave room
      </Button>
    </div>
  );
}

function PlayerList({ room }: { room: RoomPublic }) {
  return (
    <ul className="grid grid-cols-2 gap-2" aria-label="Players">
      {room.players.map((p) => (
        <li key={p.id} className="flex items-center gap-2 rounded-xl bg-plum-raised px-3 py-2">
          <Avatar name={p.name} color={p.color} size="sm" vip={p.isVip} dimmed={!p.connected} />
          <span className="truncate">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}
