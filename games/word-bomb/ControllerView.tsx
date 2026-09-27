'use client';

import { Heart } from 'lucide-react';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { TextEntry } from '@/components/shared/TextEntry';
import { YourTurn, playerOf, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import { LIVES, type WordBombPublic } from './logic';

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<WordBombPublic | null>(view);
  const mine = priv<{ active: boolean; lives: number; error: { text: string; n: number } | null }>(view);
  if (!data || !mine) return <LookAtScreen />;
  const hearts = (
    <p className="mb-3 flex justify-center gap-1" aria-label={`${mine.lives} lives left`}>
      {Array.from({ length: LIVES }, (_, i) => (
        <Heart key={i} aria-hidden className={`h-7 w-7 text-pink ${i < mine.lives ? 'fill-current' : 'opacity-30'}`} />
      ))}
    </p>
  );
  if (mine.lives === 0) return <LookAtScreen title="You're out!" detail="Cheer on the survivors." />;
  if (mine.active) {
    return (
      <div>
        {hearts}
        <YourTurn>Your turn! Hurry!</YourTurn>
        <p className="font-display mb-4 text-center text-6xl font-bold tracking-wider">{data.combo}</p>
        <TextEntry
          label={`A word containing ${data.combo}`}
          submitLabel="Defuse!"
          maxLength={20}
          resetOnSubmit
          error={mine.error?.text}
          onSubmit={(word) => send({ type: 'SUBMIT', payload: { word } })}
        />
      </div>
    );
  }
  const active = playerOf(view, data.activeId);
  return (
    <div>
      {hearts}
      <LookAtScreen title={`${active?.name ?? 'Someone'} has the bomb!`} detail={`Letters: ${data.combo}. Think of a word for your turn.`} />
    </div>
  );
}
