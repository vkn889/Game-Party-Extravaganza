'use client';

/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { DrawingCanvas } from '@/components/shared/DrawingCanvas';
import { useDrawingUpload } from '@/components/shared/DrawingUpload';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { TextEntry } from '@/components/shared/TextEntry';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { PhoneTitle, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import { SLOGAN_MAX, type ShirtShowdownPrivate, type ShirtShowdownPublic } from './logic';
import { ShirtArt } from './ShirtArt';

function Builder({ mine, onBuild }: { mine: Extract<ShirtShowdownPrivate, { kind: 'build' }>; onBuild: (drawingId: string, sloganId: string) => void }) {
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [sloganId, setSloganId] = useState<string | null>(null);
  const used = mine.built;
  const drawing = mine.drawings.find((d) => d.id === drawingId);
  const slogan = mine.slogans.find((s) => s.id === sloganId);
  return (
    <div className="flex flex-col gap-4">
      <PhoneTitle sub={`Shirt ${used.length + 1} of ${mine.needed}`}>Pick a design</PhoneTitle>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Designs">
        {mine.drawings.map((d, i) => {
          const taken = used.some((u) => u.drawingId === d.id);
          return (
            <button
              key={d.id}
              type="button"
              disabled={taken}
              aria-pressed={drawingId === d.id}
              aria-label={`Design ${i + 1}`}
              onClick={() => setDrawingId(d.id)}
              className={`overflow-hidden rounded-xl ring-4 disabled:opacity-30 ${drawingId === d.id ? 'ring-pink' : 'ring-transparent'}`}
            >
              <img src={d.url} alt="" className="aspect-square w-full bg-peach object-cover" />
            </button>
          );
        })}
      </div>
      <PhoneTitle>Pick a slogan</PhoneTitle>
      <VoteGrid
        options={mine.slogans.map((s) => ({ id: s.id, label: s.text, disabled: used.some((u) => u.sloganId === s.id), disabledReason: 'Already used' }))}
        selected={sloganId}
        onVote={setSloganId}
      />
      {drawing && slogan && (
        <div className="flex justify-center">
          <ShirtArt drawingUrl={drawing.url} slogan={slogan.text} size="sm" />
        </div>
      )}
      <Button
        size="lg"
        block
        disabled={!drawing || !slogan}
        onClick={() => {
          if (drawingId && sloganId) onBuild(drawingId, sloganId);
          setDrawingId(null);
          setSloganId(null);
        }}
      >
        Print this shirt
      </Button>
    </div>
  );
}

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<ShirtShowdownPublic>(view);
  const mine = priv<ShirtShowdownPrivate>(view);
  const upload = useDrawingUpload();
  const submit = (payload: unknown) => send({ type: 'SUBMIT', payload });

  if (view.phase === 'draw' && mine?.kind === 'draw') {
    if (mine.done >= mine.needed) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Designs sent!" />;
    return (
      <div>
        <PhoneTitle sub={mine.ideas[mine.done] ? `Idea: ${mine.ideas[mine.done]}` : 'Draw anything shirt-worthy.'}>
          Design {mine.done + 1} of {mine.needed}
        </PhoneTitle>
        <DrawingCanvas
          key={mine.done}
          submitLabel="Send design"
          onSubmit={async (png) => submit({ url: await upload(png) })}
        />
      </div>
    );
  }
  if (view.phase === 'slogan' && mine?.kind === 'slogan') {
    if (mine.done >= mine.needed) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Slogans sent!" />;
    return (
      <TextEntry
        key={mine.done}
        label={`Slogan ${mine.done + 1} of ${mine.needed}`}
        placeholder="Something worth wearing"
        maxLength={SLOGAN_MAX}
        onSubmit={(text) => submit({ text })}
      />
    );
  }
  if (view.phase === 'build' && mine?.kind === 'build') {
    if (mine.built.length >= mine.needed) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Shirts printed!" />;
    return <Builder key={mine.built.length} mine={mine} onBuild={(drawingId, sloganId) => submit({ drawingId, sloganId })} />;
  }
  if (view.phase === 'battle' && mine?.kind === 'battle' && data.left && data.right) {
    if (!mine.canVote) return <LookAtScreen title="Your shirt is in this battle!" detail="Everyone else is voting." />;
    if (mine.voted) return <LookAtScreen title="Vote locked in!" />;
    return (
      <div>
        <PhoneTitle>Which shirt wins?</PhoneTitle>
        <div className="grid grid-cols-2 gap-3">
          {[data.left, data.right].map((shirt, i) => (
            <button
              key={shirt.id}
              type="button"
              onClick={() => send({ type: 'VOTE', choiceId: shirt.id })}
              className="flex flex-col items-center gap-2 rounded-2xl bg-plum-raised p-3 shadow-card-sm"
            >
              <ShirtArt drawingUrl={shirt.drawingUrl} slogan={shirt.slogan} size="sm" />
              <span className="font-display text-lg font-semibold">{i === 0 ? 'Left' : 'Right'}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <LookAtScreen />;
}
