'use client';

import { Lock } from 'lucide-react';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { YourTurn, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import type { BuzzerBlitzPublic } from './logic';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<BuzzerBlitzPublic | null>(view);
  const mine = priv<{ locked: boolean; isBuzzer: boolean }>(view);
  if (!data || !mine) return <LookAtScreen />;
  if (mine.locked) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <Lock aria-hidden className="h-16 w-16 text-peach/70" />
        <p className="font-display text-2xl font-semibold">Locked out for this question.</p>
      </div>
    );
  }
  if (view.phase === 'answer') {
    if (!mine.isBuzzer) return <LookAtScreen title="Someone buzzed in!" detail="Get ready in case they're wrong." />;
    return (
      <div>
        <YourTurn>You buzzed! Answer fast!</YourTurn>
        <VoteGrid
          options={data.options.map((o, i) => ({ id: String(i), label: `${LETTERS[i]}. ${o}`, disabled: data.wrong.some((w) => w.choice === i), disabledReason: 'Already wrong' }))}
          onVote={(id) => send({ type: 'SUBMIT', payload: { choice: Number(id) } })}
        />
      </div>
    );
  }
  if (view.phase === 'buzz') {
    return (
      <div className="flex flex-col items-center gap-6 py-6">
        <button
          type="button"
          onPointerDown={() => send({ type: 'SUBMIT', payload: { buzz: true } })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') send({ type: 'SUBMIT', payload: { buzz: true } });
          }}
          className="font-display h-64 w-64 rounded-full bg-pink text-5xl font-bold text-plum shadow-[0_12px_0_0_var(--plum-deep)] transition-transform active:translate-y-2 active:shadow-[0_4px_0_0_var(--plum-deep)]"
        >
          BUZZ
        </button>
        <p className="text-center text-lg text-peach/85">Buzz, then pick the answer.</p>
      </div>
    );
  }
  return <LookAtScreen />;
}
