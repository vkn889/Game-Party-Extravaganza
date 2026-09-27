'use client';

import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { TextEntry } from '@/components/shared/TextEntry';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { PhoneTitle, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import type { EmojiDecodePublic } from './logic';

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<EmojiDecodePublic | null>(view);
  const mine = priv<{ solved: boolean; feedback: { text: string; n: number } | null }>(view);
  if (!data || !mine || view.phase !== 'guess') return <LookAtScreen />;
  if (mine.solved) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="You got it!" />;
  return (
    <div>
      <PhoneTitle sub={`${data.category} · ${data.mask}`}>
        <span className="text-5xl">{data.emojis}</span>
      </PhoneTitle>
      <TextEntry
        label="Your guess"
        submitLabel="Guess"
        resetOnSubmit
        error={mine.feedback?.text}
        onSubmit={(guess) => send({ type: 'SUBMIT', payload: { guess } })}
      />
    </div>
  );
}
