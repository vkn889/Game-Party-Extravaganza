import { Check, WifiOff } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { Counter } from '@/components/shared/Counter';
import type { PublicPlayer } from '@/lib/types';

/** Bottom strip on the stage: who's playing, scores, and who has submitted. */
export function PlayerStrip({ players, submittedIds }: { players: PublicPlayer[]; submittedIds: string[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-3" aria-label="Players">
      {players
        .filter((p) => p.inGame)
        .map((p) => {
          const done = submittedIds.includes(p.id);
          return (
            <li key={p.id} className={`flex items-center gap-3 rounded-2xl px-4 py-2 ${done ? 'bg-mint text-plum' : 'bg-plum-raised'}`}>
              <Avatar name={p.name} color={p.color} vip={p.isVip} dimmed={!p.connected} />
              <span className="flex flex-col leading-tight">
                <span className="font-display text-xl font-semibold">{p.name}</span>
                <Counter value={p.score} className="text-lg font-semibold" />
              </span>
              {done && <Check aria-label="submitted" className="h-6 w-6" strokeWidth={3} />}
              {!p.connected && <WifiOff aria-label="disconnected" className="h-5 w-5 text-pink" />}
            </li>
          );
        })}
    </ul>
  );
}
