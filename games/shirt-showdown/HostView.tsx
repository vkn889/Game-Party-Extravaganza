'use client';

import { m } from 'framer-motion';
import { Crown } from 'lucide-react';
import { AudienceBadge, GameIntro, PlayerTag, PointsBadge, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { publicView, type ShirtShowdownState } from './logic';
import { ShirtArt } from './ShirtArt';

export function HostView({ state }: HostViewProps<ShirtShowdownState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro') return <GameIntro slug="shirt-showdown" playerCount={players.length} />;
  if (state.phase === 'draw') return <StagePrompt kicker="Step 1">Draw two designs on your phone!</StagePrompt>;
  if (state.phase === 'slogan') return <StagePrompt kicker="Step 2">Write three shirt slogans!</StagePrompt>;
  if (state.phase === 'build')
    return (
      <div className="flex flex-col gap-6">
        <StagePrompt kicker="Step 3">Mix and match a design with a slogan!</StagePrompt>
        <StageNote>{state.shirtsEach === 2 ? 'Build 2 shirts each.' : 'Build your best shirt.'}</StageNote>
      </div>
    );

  if (state.phase === 'champion' && view.champion) {
    return (
      <div className="flex flex-col items-center gap-6">
        <StagePrompt kicker="Champion shirt">
          <span className="inline-flex items-center gap-4">
            <Crown aria-hidden className="h-14 w-14 text-pink" /> Winner!
          </span>
        </StagePrompt>
        <m.div initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }}>
          <ShirtArt drawingUrl={view.champion.drawingUrl} slogan={view.champion.slogan} />
        </m.div>
        <PlayerTag player={findPlayer(players, view.champion.builderId)} size="lg" />
      </div>
    );
  }

  if (!view.left || !view.right) return null;
  const sides = [view.left, view.right];
  const r = view.reveal;
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <StagePrompt kicker={view.mode === 'bracket' ? `Bracket round ${view.bracketRound} · Battle ${view.battleIndex + 1} of ${view.battleCount}` : `Battle ${view.battleIndex + 1} of ${view.battleCount} · vs. the House`}>
        Which shirt wins?
      </StagePrompt>
      <div className="flex items-start justify-center gap-16">
        {sides.map((shirt, i) => {
          const won = r?.winner === shirt.id;
          return (
            <m.div
              key={shirt.id}
              initial={{ x: i === 0 ? -80 : 80, opacity: 0 }}
              animate={{ x: 0, opacity: r && !won ? 0.6 : 1, scale: won ? 1.05 : 1 }}
              className="flex flex-col items-center gap-3"
            >
              <ShirtArt drawingUrl={shirt.drawingUrl} slogan={shirt.slogan} color={won ? 'var(--mint)' : 'var(--peach)'} />
              {r && (
                <div className="flex flex-col items-center gap-2">
                  <PlayerTag player={findPlayer(players, r.builders[shirt.id])} />
                  <p className="text-lg text-peach/80">
                    Art by {findPlayer(players, r.credits[shirt.id].drawing).name} · Slogan by {findPlayer(players, r.credits[shirt.id].slogan).name}
                  </p>
                  <VoterDots voters={(r.votes[shirt.id] ?? []).map((id) => findPlayer(players, id))} />
                  {r.audience === shirt.id && <AudienceBadge />}
                  <PointsBadge points={r.points[r.builders[shirt.id]] ?? 0} />
                </div>
              )}
            </m.div>
          );
        })}
      </div>
      {state.phase === 'battle' && view.bye && <StageNote>One shirt gets a bye to the next round.</StageNote>}
      {r && !r.winner && <StageNote>A tie! Nobody takes this one.</StageNote>}
    </div>
  );
}
