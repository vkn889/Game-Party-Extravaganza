'use client';

/* eslint-disable @next/next/no-img-element */
import { m } from 'framer-motion';
import { AudienceBadge, GameIntro, OptionCard, PlayerTag, PointsBadge, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import { HOUSE_ID } from '@/lib/engine/house';
import type { HostViewProps } from '@/lib/types';
import { publicView, type SketchyLiesState } from './logic';

export function HostView({ state }: HostViewProps<SketchyLiesState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro') return <GameIntro slug="sketchy-lies" playerCount={players.length} />;
  if (state.phase === 'draw') {
    return (
      <div className="flex flex-col gap-6">
        <StagePrompt kicker={`Drawing round ${view.drawRound} of ${view.drawRounds}`}>Draw your secret prompt!</StagePrompt>
        <StageNote>Weird prompts, wobbly lines. That&apos;s the fun.</StageNote>
      </div>
    );
  }
  if (!view.drawingUrl) return null;
  const r = view.reveal;
  return (
    <div className="flex w-full items-start gap-10">
      <m.div initial={{ rotate: -3, scale: 0.9, opacity: 0 }} animate={{ rotate: -2, scale: 1, opacity: 1 }} className="w-[34rem] shrink-0 rounded-3xl bg-peach p-4 shadow-card">
        <img src={view.drawingUrl} alt="A player's drawing" className="aspect-square w-full rounded-2xl" />
        {r && (
          <div className="mt-3 flex justify-center text-plum">
            <PlayerTag player={findPlayer(players, r.artistId)} />
          </div>
        )}
      </m.div>
      <div className="flex flex-1 flex-col gap-4">
        <p className="font-display text-2xl font-semibold uppercase tracking-wide text-mint">
          Drawing {view.index + 1} of {view.total}
        </p>
        {state.phase === 'lie' && (
          <>
            <h2 className="font-display stage-prompt font-bold">What is this? Write a convincing fake title!</h2>
            <StageNote>The artist sits this one out.</StageNote>
          </>
        )}
        {view.options && (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {view.options.map((o, i) => {
              const full = r?.options.find((x) => x.id === o.id);
              const isTruth = r?.truthId === o.id;
              const pickers = r ? Object.keys(r.picks).filter((p) => r.picks[p] === o.id).map((p) => findPlayer(players, p)) : [];
              return (
                <OptionCard key={o.id} index={i} label={o.text} highlight={isTruth} dim={Boolean(r) && !isTruth && pickers.length === 0}>
                  {r && full && (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-lg font-semibold">
                        {isTruth ? 'The truth!' : full.kind === 'house' ? 'House lie' : `Lie by ${full.authors.map((a) => findPlayer(players, a).name).join(' & ')}`}
                      </span>
                      {full.kind === 'lie' && full.authors.map((a) => (a !== HOUSE_ID ? <PointsBadge key={a} points={pickers.length * 500} /> : null))}
                      {r.audience === o.id && <AudienceBadge />}
                    </div>
                  )}
                  {r && <VoterDots voters={pickers} />}
                </OptionCard>
              );
            })}
          </div>
        )}
        {state.phase === 'pick' && <StageNote>Find the real title on your phone!</StageNote>}
      </div>
    </div>
  );
}
