'use client';

import { Scoreboard } from '@/components/shared/Scoreboard';
import { AudienceBadge, GameIntro, OptionCard, PlayerTag, PointsBadge, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import { HOUSE_ID } from '@/lib/engine/house';
import type { HostViewProps } from '@/lib/types';
import { ROUNDS, publicView, type PunchlineState } from './logic';

export function HostView({ state }: HostViewProps<PunchlineState>) {
  const view = publicView(state);
  const players = state.players;

  if (state.phase === 'intro') return <GameIntro slug="punchline" playerCount={players.length} />;

  if (state.phase === 'answer') {
    return (
      <div className="flex flex-col items-center gap-8">
        <StagePrompt kicker={view.final ? 'Final round' : `Round ${state.round} of ${ROUNDS}`}>
          Check your phone and write your answers!
        </StagePrompt>
        <StageNote>
          {view.final
            ? 'Everyone answers the same prompt this time.'
            : view.mode === 'duel'
              ? 'Each prompt goes to two players. Make it funnier than your rival.'
              : 'Everyone answers every prompt. Beat the House!'}
        </StageNote>
      </div>
    );
  }

  if (state.phase === 'scores') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <StagePrompt kicker={`After round ${state.round}`}>Scores</StagePrompt>
        <Scoreboard rows={players.map((p) => ({ ...p, score: state.scores[p.id] ?? 0 }))} large />
      </div>
    );
  }

  const m = view.matchup;
  if (!m) return null;
  const reveal = m.reveal;
  const bestPoints = reveal ? Math.max(0, ...Object.values(reveal.points)) : 0;
  return (
    <div className="flex w-full flex-col gap-8">
      <StagePrompt kicker={view.final ? 'Final round' : `Prompt ${view.matchupIndex + 1} of ${view.matchupCount}`}>
        {m.prompt}
      </StagePrompt>
      <div className={`mx-auto grid w-full max-w-6xl gap-6 ${m.options.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 xl:grid-cols-3'}`}>
        {m.options.map((o, i) => {
          const authorId = reveal?.authors[o.id];
          const voters = reveal ? (reveal.votes[o.id] ?? []).map((id) => findPlayer(players, id)) : [];
          const points = reveal?.points[o.id] ?? 0;
          return (
            <OptionCard
              key={o.id}
              index={i}
              label={o.missing ? <span className="italic opacity-60">(ran out of time)</span> : o.text}
              highlight={Boolean(reveal && points > 0 && points === bestPoints)}
              dim={o.missing}
            >
              {reveal && authorId && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <PlayerTag player={findPlayer(players, authorId)} size="sm" />
                  <div className="flex items-center gap-2">
                    {reveal.audience === o.id && <AudienceBadge />}
                    {authorId !== HOUSE_ID && <PointsBadge points={points} />}
                  </div>
                </div>
              )}
              {reveal && <VoterDots voters={voters} />}
            </OptionCard>
          );
        })}
      </div>
      {state.phase === 'vote' && (
        <StageNote>{view.mode === 'duel' && !view.final ? 'Everyone else: vote for the funnier answer!' : 'Vote for the best answer that isn’t yours!'}</StageNote>
      )}
    </div>
  );
}
