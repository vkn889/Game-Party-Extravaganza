'use client';

import { DrawingCanvas } from '@/components/shared/DrawingCanvas';
import { useDrawingUpload } from '@/components/shared/DrawingUpload';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { TextEntry } from '@/components/shared/TextEntry';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { ErrorNote, PhoneTitle, PromptBox, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import { TITLE_MAX, type SketchyLiesPrivate, type SketchyLiesPublic } from './logic';

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<SketchyLiesPublic>(view);
  const mine = priv<SketchyLiesPrivate>(view);
  const upload = useDrawingUpload();

  if (mine?.kind === 'draw') {
    if (mine.done) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Masterpiece sent!" />;
    return (
      <div>
        <PhoneTitle sub="Don't write any words in your drawing.">Draw this</PhoneTitle>
        <PromptBox>{mine.prompt}</PromptBox>
        <DrawingCanvas onSubmit={async (png) => send({ type: 'SUBMIT', payload: { url: await upload(png) } })} />
      </div>
    );
  }
  if (mine?.kind === 'lie') {
    if (mine.artist) return <LookAtScreen title="That's your drawing!" detail="Sit back while everyone writes fake titles." />;
    if (mine.done) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Lie submitted!" />;
    return (
      <div>
        <ErrorNote message={mine.error?.text} />
        <TextEntry key={mine.error?.n ?? 0} label="Write a fake title for the drawing" maxLength={TITLE_MAX} placeholder="Something believable" onSubmit={(text) => send({ type: 'SUBMIT', payload: { text } })} />
      </div>
    );
  }
  if (mine?.kind === 'pick' && data.options) {
    if (mine.artist) return <LookAtScreen title="Watch them guess your drawing!" />;
    if (mine.picked) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Pick locked in!" />;
    return (
      <div>
        <PhoneTitle>Which title is real?</PhoneTitle>
        <VoteGrid
          options={data.options.map((o) => ({ id: o.id, label: o.text, disabled: mine.ownOptionIds.includes(o.id), disabledReason: 'Your lie' }))}
          onVote={(id) => send({ type: 'VOTE', choiceId: id })}
        />
      </div>
    );
  }
  return <LookAtScreen />;
}
