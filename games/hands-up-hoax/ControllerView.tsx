'use client';

import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { PhoneTitle, PromptBox, YourTurn, priv } from '@/games/shared/phone';
import type { ControllerViewProps, PublicPlayer } from '@/lib/types';
import { KIND_LABELS, type HandsUpHoaxPrivate } from './logic';

function MaybeGuesses({ others, onSubmit }: { others: PublicPlayer[]; onSubmit: (g: Record<string, boolean>) => void }) {
  const [calls, setCalls] = useState<Record<string, boolean>>({});
  const complete = others.every((p) => typeof calls[p.id] === 'boolean');
  return (
    <div className="flex flex-col gap-4">
      {others.map((p) => (
        <div key={p.id} className="flex flex-col gap-2">
          <p className="font-display text-xl font-semibold">{p.name} was…</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, label: 'Faking' },
              { v: false, label: 'Legit' },
            ].map(({ v, label }) => (
              <button
                key={label}
                type="button"
                aria-pressed={calls[p.id] === v}
                onClick={() => setCalls((c) => ({ ...c, [p.id]: v }))}
                className={`min-h-12 rounded-2xl text-lg font-semibold ${calls[p.id] === v ? 'bg-pink text-plum' : 'bg-peach text-plum'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button size="lg" block disabled={!complete} onClick={() => onSubmit(calls)}>
        Lock in guesses
      </Button>
    </div>
  );
}

export default function ControllerView({ view, send }: ControllerViewProps) {
  const mine = priv<HandsUpHoaxPrivate>(view);
  if (mine?.kind === 'task') {
    if (mine.faker) {
      return (
        <div>
          <YourTurn>You&apos;re the faker!</YourTurn>
          <PromptBox>You don&apos;t know the task. It&apos;s a “{KIND_LABELS[mine.category]}” task. Watch the others and blend in.</PromptBox>
          {view.phase === 'act' && <p className="font-display text-center text-2xl font-bold">Act now!</p>}
        </div>
      );
    }
    return (
      <div>
        <PhoneTitle sub="Keep it secret. Do it when the big screen says go.">Your task</PhoneTitle>
        <PromptBox>{mine.task}</PromptBox>
        {view.phase === 'act' && <YourTurn>Do it now!</YourTurn>}
      </div>
    );
  }
  if (view.phase === 'vote' && mine?.kind === 'vote') {
    if (mine.done) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Vote locked in!" />;
    const others = view.players.filter((p) => p.inGame && p.id !== view.me);
    if (mine.mode === 'classic') {
      return (
        <div>
          <PhoneTitle>Who&apos;s the faker?</PhoneTitle>
          <VoteGrid options={others.map((p) => ({ id: p.id, label: p.name, color: p.color }))} onVote={(id) => send({ type: 'VOTE', choiceId: id })} />
        </div>
      );
    }
    return (
      <div>
        <PhoneTitle sub="There could be 0, 1 or 2 fakers.">Who was faking?</PhoneTitle>
        <MaybeGuesses others={others} onSubmit={(guesses) => send({ type: 'SUBMIT', payload: { guesses } })} />
      </div>
    );
  }
  return <LookAtScreen />;
}
