import { Crown } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import { GAME_META } from '@/games/meta';
import type { VipAction } from '@/lib/realtime/useRoomChannel';
import { Timer } from '@/components/shared/Timer';
import type { GameResults, RoomPublic } from '@/lib/types';

export function PhoneResults({
  results,
  room,
  me,
  isVip,
  sendVip,
}: {
  results: GameResults;
  room: RoomPublic;
  me: string;
  isVip: boolean;
  sendVip: (a: VipAction) => void;
}) {
  const t = room.tournament;
  const mine = results.standings.find((s) => s.id === me);
  const won = results.winners.includes(me);
  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-2xl p-5 text-center ${won ? 'bg-pink text-plum' : 'bg-plum-raised'}`}>
        {won && <Crown aria-hidden className="mx-auto mb-2 h-10 w-10" />}
        <p className="font-display text-3xl font-bold">{won ? 'You win!' : mine ? `You finished #${mine.rank}` : 'Game over!'}</p>
        <p>{GAME_META[results.game].name}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {results.standings.map((s) => (
          <li key={s.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${s.id === me ? 'bg-purple' : 'bg-plum-raised'}`}>
            <span className="font-display w-6 text-center font-bold">{s.rank}</span>
            <Avatar name={s.name} color={s.color} size="sm" />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="font-display font-bold tabular-nums">{s.score.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      {t && (
        <div className="flex flex-col gap-2 rounded-2xl bg-plum-raised p-4">
          <p className="font-display text-xl font-bold">{t.finished ? 'Tournament over!' : `Tournament: game ${t.index} of ${t.games.length} done`}</p>
          {t.finished && t.standings[0] && (
            <p className="flex items-center gap-2 text-lg">
              <Crown aria-hidden className="h-5 w-5 text-pink" /> Champion: {t.standings.filter((x) => x.rank === 1).map((x) => x.name).join(' & ')}
            </p>
          )}
          <ol className="flex flex-col gap-1">
            {t.standings.map((x) => (
              <li key={x.id} className={`flex items-center gap-2 ${x.id === me ? 'font-bold text-pink' : ''}`}>
                <span className="w-5">{x.rank}</span>
                <span className="flex-1 truncate">{x.name}</span>
                <span className="tabular-nums">{x.points} pts</span>
              </li>
            ))}
          </ol>
          {!t.finished && (
            <p className="flex items-center gap-3">
              <Timer endsAt={t.nextGameAt} size="sm" label="Next game in" /> Next up: {GAME_META[t.games[t.index]].name}
            </p>
          )}
        </div>
      )}
      {isVip && t && !t.finished && (
        <div className="flex flex-col gap-3">
          <Button size="lg" block onClick={() => sendVip({ type: 'VIP_START' })}>
            Start next game now
          </Button>
          <Button size="lg" block variant="secondary" onClick={() => sendVip({ type: 'VIP_LOBBY' })}>
            End tournament
          </Button>
        </div>
      )}
      {isVip && (!t || t.finished) && (
        <div className="flex flex-col gap-3">
          <Button size="lg" block onClick={() => sendVip({ type: 'VIP_START' })}>
            Play again
          </Button>
          <Button size="lg" block variant="secondary" onClick={() => sendVip({ type: 'VIP_LOBBY' })}>
            Back to lobby
          </Button>
        </div>
      )}
    </div>
  );
}
