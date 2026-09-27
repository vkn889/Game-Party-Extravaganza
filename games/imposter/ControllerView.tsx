'use client';

import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { TextEntry } from '@/components/shared/TextEntry';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { ErrorNote, PhoneTitle, YourTurn, playerOf, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps, PublicPlayer } from '@/lib/types';
import { CLUE_MAX, type ImposterPrivate, type ImposterPublic } from './logic';

function WordCard({ word, imposter, category }: { word: string | null; imposter: boolean; category: string }) {
  return (
    <div className="mb-4 rounded-2xl bg-peach px-4 py-4 text-center text-plum shadow-card-sm">
      <p className="text-sm font-semibold uppercase tracking-wide">Category: {category}</p>
      {imposter ? (
        <p className="font-display mt-1 text-3xl font-bold text-purple">You&apos;re the imposter!</p>
      ) : (
        <p className="font-display mt-1 text-4xl font-bold">{word}</p>
      )}
      {imposter && <p className="mt-1">Blend in. Figure out the word from the clues.</p>}
    </div>
  );
}

function Judge({ others, onSubmit }: { others: PublicPlayer[]; onSubmit: (calls: Record<string, boolean>) => void }) {
  const [calls, setCalls] = useState<Record<string, boolean>>({});
  return (
    <div className="flex flex-col gap-4">
      {others.map((p) => (
        <div key={p.id} className="flex flex-col gap-2">
          <p className="font-display text-xl font-semibold">Does {p.name} have your word?</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, label: 'Same word' },
              { v: false, label: 'Different' },
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
      <Button size="lg" block disabled={!others.every((p) => typeof calls[p.id] === 'boolean')} onClick={() => onSubmit(calls)}>
        Lock in
      </Button>
    </div>
  );
}

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<ImposterPublic | null>(view);
  const mine = priv<ImposterPrivate>(view);
  if (!data || !mine) return <LookAtScreen />;

  if (mine.kind === 'guess') {
    if (!mine.imposter) return <LookAtScreen title="The imposter is guessing the word…" />;
    if (view.submitted) return <LookAtScreen title="Guess locked in!" />;
    return (
      <div>
        <YourTurn>Guess the secret word to steal the win!</YourTurn>
        <VoteGrid columns={2} options={mine.options.map((o) => ({ id: o, label: o }))} onVote={(word) => send({ type: 'SUBMIT', payload: { word } })} />
      </div>
    );
  }

  const card = <WordCard word={mine.word} imposter={mine.imposter} category={data.category} />;
  if (view.phase === 'clue') {
    if (mine.active) {
      return (
        <div>
          {card}
          <YourTurn>Your clue: one word!</YourTurn>
          <ErrorNote message={mine.error?.text} />
          <TextEntry key={mine.error?.n ?? 0} label="Your one-word clue" maxLength={CLUE_MAX} onSubmit={(text) => send({ type: 'SUBMIT', payload: { text } })} />
        </div>
      );
    }
    const active = data.activeId ? playerOf(view, data.activeId) : undefined;
    return (
      <div>
        {card}
        <LookAtScreen title={active ? `${active.name} is giving a clue…` : 'Listen to the clues.'} />
      </div>
    );
  }
  if (view.phase === 'vote') {
    if (view.submitted) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Vote locked in!" />;
    return (
      <div>
        {card}
        <PhoneTitle>Who&apos;s the imposter?</PhoneTitle>
        <VoteGrid
          options={view.players.filter((p) => p.inGame && p.id !== view.me).map((p) => ({ id: p.id, label: p.name, color: p.color }))}
          onVote={(id) => send({ type: 'VOTE', choiceId: id })}
        />
      </div>
    );
  }
  if (view.phase === 'judge') {
    if (view.submitted) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Calls locked in!" />;
    return (
      <div>
        {card}
        <Judge others={view.players.filter((p) => p.inGame && p.id !== view.me)} onSubmit={(calls) => send({ type: 'SUBMIT', payload: { calls } })} />
      </div>
    );
  }
  return (
    <div>
      {card}
      <LookAtScreen title="Remember your word. Clues are coming up!" />
    </div>
  );
}
