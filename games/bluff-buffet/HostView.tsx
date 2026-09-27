'use client';

import { AudienceBadge, GameIntro, OptionCard, PointsBadge, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { publicView, type BluffBuffetState } from './logic';

function FactText({ text, answer }: { text: string; answer?: string }) {
  const parts = text.split('___');
  if (parts.length < 2) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <span className={`mx-1 inline-block min-w-32 rounded-xl px-3 ${answer ? 'bg-mint text-plum' : 'border-b-4 border-pink'}`}>{answer ?? ' '}</span>
      {parts.slice(1).join('___')}
    </>
  );
}

export function HostView({ state }: HostViewProps<BluffBuffetState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro' || !view) return <GameIntro slug="bluff-buffet" playerCount={players.length} />;
  const r = view.reveal;
  const truth = r?.options.find((o) => o.kind === 'truth');
  const kicker = `${view.index + 1 === view.total && view.multiplier === 3 ? 'Final fact' : `Fact ${view.index + 1} of ${view.total}`}${view.multiplier > 1 ? ` · ${view.multiplier}x points` : ''}`;
  return (
    <div className="flex w-full flex-col gap-8">
      <StagePrompt kicker={kicker}>
        <FactText text={view.fact} answer={truth?.text} />
      </StagePrompt>
      {state.phase === 'lie' && <StageNote>Write a believable lie to fill the blank!</StageNote>}
      {view.options && (
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-4 xl:grid-cols-3">
          {view.options.map((o, i) => {
            const full = r?.options.find((x) => x.id === o.id);
            const pickers = r ? Object.keys(r.picks).filter((p) => r.picks[p] === o.id).map((p) => findPlayer(players, p)) : [];
            return (
              <OptionCard key={o.id} index={i} label={o.text} highlight={full?.kind === 'truth'} dim={Boolean(r) && full?.kind !== 'truth' && pickers.length === 0}>
                {r && full && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-lg font-semibold">
                      {full.kind === 'truth' ? 'The truth!' : full.kind === 'house' ? 'House lie' : `Lie by ${full.authors.map((a) => findPlayer(players, a).name).join(' & ')}`}
                    </span>
                    {full.kind === 'lie' && <PointsBadge points={pickers.length * 500 * view.multiplier} />}
                    {r.audience === o.id && <AudienceBadge />}
                  </div>
                )}
                {r && <VoterDots voters={pickers} />}
              </OptionCard>
            );
          })}
        </div>
      )}
      {state.phase === 'pick' && <StageNote>Find the truth on your phone!</StageNote>}
    </div>
  );
}
