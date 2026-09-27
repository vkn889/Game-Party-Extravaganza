'use client';

import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { PhoneTitle, PromptBox, YourTurn, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import { BET_LABELS, BETS, MUCH, type StatSnoopPrivate, type StatSnoopPublic } from './logic';

function Slider({ onSubmit }: { onSubmit: (value: number) => void }) {
  const [value, setValue] = useState(50);
  return (
    <div className="flex flex-col gap-5">
      <p className="font-display text-center text-6xl font-bold text-pink" aria-live="polite">
        {value}%
      </p>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        aria-label="Your percentage guess"
        onChange={(e) => setValue(Number(e.target.value))}
        className="h-12 w-full accent-pink"
      />
      <div className="grid grid-cols-4 gap-2">
        {[-5, -1, 1, 5].map((d) => (
          <Button key={d} variant="ghost" onClick={() => setValue((v) => Math.min(100, Math.max(0, v + d)))}>
            {d > 0 ? `+${d}` : d}
          </Button>
        ))}
      </div>
      <Button size="lg" block onClick={() => onSubmit(value)}>
        Lock in {value}%
      </Button>
    </div>
  );
}

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<StatSnoopPublic | null>(view);
  const mine = priv<StatSnoopPrivate>(view);
  if (!data || !mine) return <LookAtScreen />;

  if (view.phase === 'guess') {
    if (mine.role !== 'guesser') return <LookAtScreen title="Someone else is guessing." detail="Get ready to bet on it." />;
    if (mine.done) return <LookAtScreen title="Guess locked in!" />;
    return (
      <div>
        <YourTurn>You&apos;re the guesser!</YourTurn>
        <PromptBox>{data.question}</PromptBox>
        <Slider onSubmit={(value) => send({ type: 'SUBMIT', payload: { value } })} />
      </div>
    );
  }

  if (view.phase === 'bet') {
    if (mine.role === 'guesser') return <LookAtScreen title="Everyone is betting on your guess." />;
    if (mine.done) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Bet placed!" />;
    return (
      <div>
        <PhoneTitle sub={`"Much" means more than ${MUCH} points away and pays double.`}>
          The guess is {data.guess}%. The real answer is…
        </PhoneTitle>
        <VoteGrid options={BETS.map((b) => ({ id: b, label: BET_LABELS[b] }))} onVote={(id) => send({ type: 'VOTE', choiceId: id })} />
      </div>
    );
  }
  return <LookAtScreen />;
}
