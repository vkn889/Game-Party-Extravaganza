'use client';

import { AudienceBadge, GameIntro, OptionCard, PlayerTag, PointsBadge, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { publicView, type TwoTruthsState } from './logic';

export function HostView({ state }: HostViewProps<TwoTruthsState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro') return <GameIntro slug="two-truths" playerCount={players.length} />;
  if (state.phase === 'write') {
    return (
      <div className="flex flex-col gap-6">
        <StagePrompt kicker="Get writing">Write 2 truths and 1 lie about yourself.</StagePrompt>
        <StageNote>Make the lie believable and the truths surprising!</StageNote>
      </div>
    );
  }
  if (!view) return null;
  const author = findPlayer(players, view.authorId);
  const r = view.reveal;
  return (
    <div className="flex w-full flex-col gap-8">
      <StagePrompt kicker={`${view.index + 1} of ${view.total}`}>
        <span className="inline-flex items-center gap-4">
          <PlayerTag player={author} size="lg" />
        </span>
        <span className="mt-4 block">Which one is the lie?</span>
      </StagePrompt>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4">
        {view.options.map((o, i) => {
          const isLie = r?.lieId === o.id;
          const guessers = r ? Object.keys(r.guesses).filter((g) => r.guesses[g] === o.id).map((g) => findPlayer(players, g)) : [];
          return (
            <OptionCard key={o.id} index={i} label={o.text} highlight={isLie} dim={Boolean(r) && !isLie}>
              {r && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-semibold">{isLie ? 'The lie!' : 'True'}</span>
                  <VoterDots voters={guessers} />
                  {r.audience === o.id && <AudienceBadge />}
                </div>
              )}
            </OptionCard>
          );
        })}
      </div>
      {r && (
        <div className="flex flex-wrap justify-center gap-4">
          {Object.entries(r.points).map(([id, pts]) => (
            <span key={id} className="flex items-center gap-2">
              <PlayerTag player={findPlayer(players, id)} size="sm" />
              <PointsBadge points={pts} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
