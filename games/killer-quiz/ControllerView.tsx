'use client';

import { Ghost } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { PhoneTitle, YourTurn, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import { SYMBOLS, type KillerQuizPrivate, type KillerQuizPublic } from './logic';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function DicePicker({ onSubmit }: { onSubmit: (picks: number[]) => void }) {
  const [picks, setPicks] = useState<number[]>([]);
  const toggle = (n: number) =>
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length < 3 ? [...p, n] : p));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3" role="group" aria-label="Pick three numbers">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={picks.includes(n)}
            onClick={() => toggle(n)}
            className={`font-display h-20 rounded-2xl text-4xl font-bold ${picks.includes(n) ? 'bg-pink text-plum' : 'bg-peach text-plum'}`}
          >
            {n}
          </button>
        ))}
      </div>
      <Button size="lg" block disabled={picks.length !== 3} onClick={() => onSubmit(picks)}>
        Lock in {picks.length}/3
      </Button>
    </div>
  );
}

function MemoryPad({ length, onSubmit }: { length: number; onSubmit: (seq: number[]) => void }) {
  const [seq, setSeq] = useState<number[]>([]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-plum-deep text-4xl" aria-live="polite">
        {seq.length ? seq.map((n, i) => <span key={i}>{SYMBOLS[n]}</span>) : <span className="text-base text-peach/70">Tap the symbols in order</span>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {SYMBOLS.map((sym, i) => (
          <button
            key={sym}
            type="button"
            aria-label={`Symbol ${sym}`}
            disabled={seq.length >= length}
            onClick={() => setSeq((s) => [...s, i])}
            className="h-20 rounded-2xl bg-peach text-5xl text-plum disabled:opacity-50"
          >
            {sym}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" disabled={!seq.length} onClick={() => setSeq((s) => s.slice(0, -1))}>
          Undo
        </Button>
        <Button className="flex-1" disabled={seq.length !== length} onClick={() => onSubmit(seq)}>
          Submit
        </Button>
      </div>
    </div>
  );
}

function MathSheet({ problems, onSubmit }: { problems: string[]; onSubmit: (answers: number[]) => void }) {
  const [values, setValues] = useState<string[]>(problems.map(() => ''));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values.map((v) => (v.trim() === '' ? Number.NaN : Number(v))));
      }}
    >
      {problems.map((p, i) => (
        <label key={p} className="flex items-center gap-3">
          <span className="font-display w-32 text-2xl font-bold">{p} =</span>
          <input
            inputMode="numeric"
            pattern="-?[0-9]*"
            value={values[i]}
            aria-label={`Answer to ${p}`}
            onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
            className="h-14 flex-1 rounded-2xl bg-peach px-4 text-2xl text-plum"
          />
        </label>
      ))}
      <Button type="submit" size="lg" block>
        Submit answers
      </Button>
    </form>
  );
}

function FinalePicker({ options, onSubmit }: { options: string[]; onSubmit: (picks: number[]) => void }) {
  const [picks, setPicks] = useState<number[]>([]);
  return (
    <div className="flex flex-col gap-3">
      {options.map((o, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={picks.includes(i)}
          onClick={() => setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))}
          className={`min-h-14 rounded-2xl px-4 py-3 text-left text-lg font-semibold ${picks.includes(i) ? 'bg-pink text-plum' : 'bg-peach text-plum'}`}
        >
          {LETTERS[i]}. {o}
        </button>
      ))}
      <Button size="lg" block onClick={() => onSubmit(picks)}>
        Run! ({picks.length} picked)
      </Button>
    </div>
  );
}

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<KillerQuizPublic>(view);
  const mine = priv<KillerQuizPrivate>(view);
  const submit = (payload: unknown) => send({ type: 'SUBMIT', payload });

  if (view.phase === 'question' && data.question && mine?.kind === 'question') {
    if (mine.answered != null || view.submitted) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Answer locked in!" />;
    return (
      <div>
        {mine.ghost && (
          <p className="mb-3 flex items-center gap-2 text-mint">
            <Ghost aria-hidden className="h-5 w-5" /> You&apos;re a ghost, but you can still score.
          </p>
        )}
        <PhoneTitle>{data.question.text}</PhoneTitle>
        <VoteGrid
          options={data.question.options.map((o, i) => ({ id: String(i), label: `${LETTERS[i]}. ${o}` }))}
          onVote={(id) => submit({ choice: Number(id) })}
        />
      </div>
    );
  }

  const inDanger = mine && 'atRisk' in mine && mine.atRisk;
  if (view.phase === 'dice' && mine?.kind === 'dice') {
    if (!inDanger) return <LookAtScreen title="You're safe this time." />;
    if (mine.picks || view.submitted) return <LookAtScreen title={`Your numbers: ${mine.picks?.join(', ') ?? ''}`} detail="Pray to the dice." />;
    return (
      <div>
        <YourTurn>Pick 3 numbers to survive!</YourTurn>
        <DicePicker onSubmit={(picks) => submit({ picks })} />
      </div>
    );
  }
  if (view.phase === 'memoryShow') return <LookAtScreen title="Memorize the symbols on the big screen!" />;
  if (view.phase === 'memoryInput' && mine?.kind === 'memoryInput') {
    if (!inDanger) return <LookAtScreen title="You're safe this time." />;
    if (mine.done || view.submitted) return <LookAtScreen title="Sequence sent." detail="Fingers crossed." />;
    return (
      <div>
        <YourTurn>Enter the sequence!</YourTurn>
        <MemoryPad length={5} onSubmit={(sequence) => submit({ sequence })} />
      </div>
    );
  }
  if (view.phase === 'math' && mine?.kind === 'math') {
    if (!inDanger) return <LookAtScreen title="You're safe this time." />;
    if (mine.done || view.submitted) return <LookAtScreen title="Answers sent." />;
    return (
      <div>
        <YourTurn>Solve at least 2 of 3!</YourTurn>
        <MathSheet problems={mine.problems} onSubmit={(answers) => submit({ answers })} />
      </div>
    );
  }
  if (view.phase === 'finale' && data.finale && mine?.kind === 'finale') {
    if (mine.picks || view.submitted) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Picks locked in!" />;
    return (
      <div>
        <PhoneTitle sub="Pick every correct answer. Wrong picks cancel right ones.">{data.finale.text}</PhoneTitle>
        <FinalePicker options={data.finale.options.map((o) => o.label)} onSubmit={(picks) => submit({ picks })} />
      </div>
    );
  }
  return <LookAtScreen />;
}
