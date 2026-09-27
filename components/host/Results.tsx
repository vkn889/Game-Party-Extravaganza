'use client';

import { m } from 'framer-motion';
import { Crown, Trophy } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { Scoreboard } from '@/components/shared/Scoreboard';
import { Timer } from '@/components/shared/Timer';
import { GAME_META } from '@/games/meta';
import type { GameResults, RoomPublic } from '@/lib/types';

/** End-of-game results plus the session leaderboard of game wins (FR-15). */
export function Results({ results, room }: { results: GameResults; room: RoomPublic }) {
  const winners = results.standings.filter((s) => results.winners.includes(s.id));
  return (
    <div className="grid w-full flex-1 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-10">
      <section className="flex flex-col gap-6">
        <p className="font-display text-3xl font-semibold uppercase tracking-wide text-mint">{GAME_META[results.game].name} results</p>
        <m.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }} className="flex flex-wrap items-center gap-6 rounded-3xl bg-pink p-6 text-plum shadow-card">
          <Crown aria-hidden className="h-16 w-16" />
          {winners.length ? (
            winners.map((w) => (
              <span key={w.id} className="flex items-center gap-3">
                <Avatar name={w.name} color={w.color} size="xl" />
                <span className="font-display text-6xl font-bold">{w.name}</span>
              </span>
            ))
          ) : (
            <span className="font-display text-5xl font-bold">No winner this time!</span>
          )}
          {winners.length > 0 && <span className="font-display text-4xl font-bold">{winners.length > 1 ? 'win!' : 'wins!'}</span>}
        </m.div>
        <Scoreboard rows={results.standings} highlight={results.winners} large />
      </section>
      {room.tournament ? <TournamentPanel room={room} /> : (
      <section className="flex flex-col gap-4 rounded-3xl bg-plum-raised p-8">
        <h2 className="font-display flex items-center gap-3 text-4xl font-bold">
          <Trophy aria-hidden className="h-9 w-9 text-pink" /> Tonight&apos;s wins
        </h2>
        <ol className="flex flex-col gap-3">
          {room.leaderboard.map((l) => (
            <li key={l.id} className="flex items-center gap-4 text-2xl">
              <Avatar name={l.name} color={l.color} />
              <span className="font-display flex-1 font-semibold">{l.name}</span>
              <span className="font-display font-bold tabular-nums">{l.gamesWon}</span>
            </li>
          ))}
        </ol>
        <p className="mt-auto text-xl text-peach/85">The VIP can play again or head back to the lobby.</p>
      </section>
      )}
    </div>
  );
}

/** Tournament standings between games, and the champion at the end. */
function TournamentPanel({ room }: { room: RoomPublic }) {
  const t = room.tournament!;
  const champions = t.finished ? t.standings.filter((s) => s.rank === 1) : [];
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-plum-raised p-8">
      <h2 className="font-display flex items-center gap-3 text-4xl font-bold">
        <Trophy aria-hidden className="h-9 w-9 text-pink" /> {t.finished ? 'Tournament champion' : 'Tournament standings'}
      </h2>
      {champions.length > 0 && (
        <m.div initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="flex flex-wrap items-center gap-3 rounded-2xl bg-pink p-4 text-plum">
          <Crown aria-hidden className="h-10 w-10" />
          {champions.map((c) => (
            <span key={c.id} className="font-display text-4xl font-bold">
              {c.name}
            </span>
          ))}
        </m.div>
      )}
      <ol className="flex flex-col gap-3">
        {t.standings.map((s) => (
          <li key={s.id} className="flex items-center gap-4 text-2xl">
            <span className="font-display w-8 font-bold">{s.rank}</span>
            <Avatar name={s.name} color={s.color} />
            <span className="font-display flex-1 font-semibold">{s.name}</span>
            <span className="font-display font-bold tabular-nums">{s.points} pts</span>
          </li>
        ))}
      </ol>
      <ol className="flex flex-wrap gap-2" aria-label="Tournament games">
        {t.games.map((slug, i) => {
          const done = t.finished || i < t.index;
          const next = !t.finished && i === t.index;
          return (
            <li key={`${slug}-${i}`} className={`rounded-full px-3 py-1 text-lg ${next ? 'bg-pink text-plum' : done ? 'bg-plum text-peach/70 line-through' : 'bg-plum text-peach'}`}>
              {i + 1}. {GAME_META[slug].name}
            </li>
          );
        })}
      </ol>
      {!t.finished && (
        <div className="mt-auto flex items-center gap-4 text-2xl">
          <Timer endsAt={t.nextGameAt} label="Next game in" />
          <span>
            Next up: <strong className="font-display">{GAME_META[t.games[t.index]].name}</strong>
          </span>
        </div>
      )}
      {t.finished && <p className="mt-auto text-xl text-peach/85">The VIP can start a new game or head back to the lobby.</p>}
    </section>
  );
}
