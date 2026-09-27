'use client';

/* eslint-disable @next/next/no-img-element */
import { DrawingCanvas } from '@/components/shared/DrawingCanvas';
import { useDrawingUpload } from '@/components/shared/DrawingUpload';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { TextEntry } from '@/components/shared/TextEntry';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { PhoneTitle, PromptBox, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import type { DoodleTelephonePrivate, DoodleTelephonePublic } from './logic';

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<DoodleTelephonePublic>(view);
  const mine = priv<DoodleTelephonePrivate>(view);
  const upload = useDrawingUpload();
  if (!mine) return <LookAtScreen />;

  if ((mine.kind === 'write' || mine.kind === 'draw' || mine.kind === 'describe') && mine.done) {
    return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Passed along!" />;
  }
  if (mine.kind === 'write') {
    return (
      <TextEntry
        label="Write a sentence for someone to draw"
        placeholder={mine.suggestion}
        onSubmit={(text) => send({ type: 'SUBMIT', payload: { text } })}
      />
    );
  }
  if (mine.kind === 'draw') {
    return (
      <div>
        <PhoneTitle>Draw this</PhoneTitle>
        {mine.source.kind === 'text' ? (
          <PromptBox>{mine.source.content}</PromptBox>
        ) : (
          <img src={mine.source.content} alt="The drawing to redraw" className="mb-4 aspect-square w-1/2 rounded-xl bg-white" />
        )}
        <DrawingCanvas onSubmit={async (png) => send({ type: 'SUBMIT', payload: { url: await upload(png) } })} />
      </div>
    );
  }
  if (mine.kind === 'describe') {
    return (
      <div>
        <PhoneTitle>What is this?</PhoneTitle>
        {mine.source.kind === 'drawing' ? (
          <img src={mine.source.content} alt="The drawing to describe" className="mb-4 aspect-square w-full rounded-2xl bg-white" />
        ) : (
          <PromptBox>{mine.source.content}</PromptBox>
        )}
        <TextEntry label="Describe it in a sentence" onSubmit={(text) => send({ type: 'SUBMIT', payload: { text } })} />
      </div>
    );
  }
  if (mine.kind === 'vote' && data.book) {
    if (mine.voted) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Vote locked in!" />;
    return (
      <div>
        <PhoneTitle>Best link in this book?</PhoneTitle>
        <VoteGrid
          options={data.book.entries
            .map((e, i) => ({ e, i }))
            .filter(({ e }) => !e.missing)
            .map(({ e, i }) => ({
              id: String(i),
              label: e.kind === 'text' ? `${i + 1}. ${e.content}` : `${i + 1}. Drawing by ${view.players.find((p) => p.id === e.authorId)?.name ?? 'someone'}`,
              disabled: mine.ownEntries.includes(i),
              disabledReason: 'Yours',
            }))}
          onVote={(id) => send({ type: 'VOTE', choiceId: id })}
        />
      </div>
    );
  }
  return <LookAtScreen />;
}
