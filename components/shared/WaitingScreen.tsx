import { Check } from 'lucide-react';
import type { PublicPlayer } from '@/lib/types';
import { Avatar } from './Avatar';

interface WaitingScreenProps {
  players: PublicPlayer[];
  submittedIds: string[];
  message?: string;
  /** Limit the list to the players this step is waiting on. */
  eligibleIds?: string[];
}

/** "Waiting for others" with who has submitted, so nobody feels stuck (PRD §2). */
export function WaitingScreen({ players, submittedIds, message = 'Sent! Waiting for everyone else.', eligibleIds }: WaitingScreenProps) {
  const list = players.filter((p) => p.inGame && (!eligibleIds || eligibleIds.includes(p.id)));
  const done = list.filter((p) => submittedIds.includes(p.id)).length;
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-mint text-plum">
        <Check className="h-9 w-9" strokeWidth={3} aria-hidden />
      </div>
      <p className="font-display text-2xl font-semibold">{message}</p>
      <p className="text-peach/80" aria-live="polite">
        {done} of {list.length} done
      </p>
      <ul className="grid w-full grid-cols-2 gap-2">
        {list.map((p) => {
          const submitted = submittedIds.includes(p.id);
          return (
            <li key={p.id} className="flex items-center gap-2 rounded-xl bg-plum-raised px-3 py-2">
              <Avatar name={p.name} color={p.color} size="sm" dimmed={!p.connected} />
              <span className="flex-1 truncate text-left">{p.name}</span>
              {submitted ? (
                <Check aria-label="submitted" className="h-5 w-5 text-mint" strokeWidth={3} />
              ) : (
                <span className="text-sm text-peach/70">…</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
