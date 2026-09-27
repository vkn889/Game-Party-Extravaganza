'use client';

import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { TextEntry } from '@/components/shared/TextEntry';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { ErrorNote, PhoneTitle, PromptBox, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import { LIE_MAX, type BluffBuffetPrivate, type BluffBuffetPublic } from './logic';

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<BluffBuffetPublic | null>(view);
  const mine = priv<BluffBuffetPrivate>(view);
  if (!data || !mine) return <LookAtScreen />;
  if (mine.kind === 'lie') {
    if (mine.done) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Lie served!" />;
    return (
      <div>
        <PromptBox>{data.fact}</PromptBox>
        <ErrorNote message={mine.error?.text} />
        <TextEntry key={mine.error?.n ?? 0} label="Fill the blank with a lie" maxLength={LIE_MAX} onSubmit={(text) => send({ type: 'SUBMIT', payload: { text } })} />
      </div>
    );
  }
  if (mine.kind === 'pick' && data.options) {
    if (mine.picked) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Pick locked in!" />;
    return (
      <div>
        <PhoneTitle>Pick the truth</PhoneTitle>
        <VoteGrid
          options={data.options.map((o) => ({ id: o.id, label: o.text, disabled: mine.ownOptionIds.includes(o.id), disabledReason: 'Your lie' }))}
          onVote={(id) => send({ type: 'VOTE', choiceId: id })}
        />
      </div>
    );
  }
  return <LookAtScreen />;
}
