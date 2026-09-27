'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/shared/Button';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { PhoneTitle, playerOf, priv, pub } from '@/games/shared/phone';
import { DEFAULT_MAX_CHARS } from '@/lib/engine/text';
import type { ControllerViewProps } from '@/lib/types';
import type { TwoTruthsPrivate, TwoTruthsPublic } from './logic';

function Writer({ ideas, onSubmit }: { ideas: string[]; onSubmit: (truths: [string, string], lie: string) => void }) {
  const [fields, setFields] = useState(['', '', '']);
  const labels = ['Truth #1', 'Truth #2', 'The lie'];
  const ready = fields.every((f) => f.trim());
  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready) onSubmit([fields[0].trim(), fields[1].trim()], fields[2].trim());
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <PhoneTitle sub={ideas.length ? `Ideas: ${ideas.join(' · ')}` : undefined}>About you</PhoneTitle>
      {labels.map((label, i) => (
        <label key={label} className="flex flex-col gap-1">
          <span className={`font-display text-lg font-semibold ${i === 2 ? 'text-pink' : ''}`}>{label}</span>
          <input
            value={fields[i]}
            maxLength={DEFAULT_MAX_CHARS}
            onChange={(e) => setFields((f) => f.map((x, j) => (j === i ? e.target.value : x)))}
            className="rounded-2xl bg-peach px-4 py-3 text-lg text-plum"
          />
        </label>
      ))}
      <Button type="submit" size="lg" block disabled={!ready}>
        Submit
      </Button>
    </form>
  );
}

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<TwoTruthsPublic | null>(view);
  const mine = priv<TwoTruthsPrivate>(view);
  if (mine?.kind === 'write') {
    if (mine.done) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Statements sent!" />;
    return <Writer ideas={mine.ideas} onSubmit={(truths, lie) => send({ type: 'SUBMIT', payload: { truths, lie } })} />;
  }
  if (mine?.kind === 'guess' && data) {
    if (mine.author) return <LookAtScreen title="It's about you!" detail="Keep a straight face." />;
    if (mine.guessed) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Guess locked in!" />;
    return (
      <div>
        <PhoneTitle>Which is {playerOf(view, data.authorId)?.name ?? 'their'}&apos;s lie?</PhoneTitle>
        <VoteGrid options={data.options.map((o) => ({ id: o.id, label: o.text }))} onVote={(id) => send({ type: 'VOTE', choiceId: id })} />
      </div>
    );
  }
  return <LookAtScreen />;
}
