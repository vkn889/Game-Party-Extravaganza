'use client';

import { m } from 'framer-motion';
import { Lock } from 'lucide-react';
import { GameIntro, OptionCard, PlayerTag, PointsBadge, StageNote, StagePrompt, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { POINTS, publicView, type BuzzerBlitzState } from './logic';

const LETTERS = ['A', 'B', 'C', 'D'];

export function HostView({ state }: HostViewProps<BuzzerBlitzState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro' || !view) return <GameIntro slug="buzzer-blitz" playerCount={players.length} />;
  return (
    <div className="flex w-full flex-col gap-8">
      <StagePrompt kicker={`Question ${view.index + 1} of ${view.total}`}>{view.text}</StagePrompt>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-4">
        {view.options.map((o, i) => (
          <OptionCard
            key={i}
            index={i}
            label={`${LETTERS[i]}. ${o}`}
            highlight={view.correct === i}
            dim={view.wrong.some((w) => w.choice === i) || (view.correct != null && view.correct !== i)}
          >
            {view.wrong
              .filter((w) => w.choice === i)
              .map((w) => (
                <span key={w.playerId} className="text-lg font-semibold">
                  Wrong: {findPlayer(players, w.playerId).name}
                </span>
              ))}
          </OptionCard>
        ))}
      </div>
      {state.phase === 'answer' && view.buzzer && (
        <m.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center justify-center gap-4">
          <span className="font-display animate-your-turn rounded-full bg-pink px-6 py-3 text-4xl font-bold text-plum">BUZZ!</span>
          <PlayerTag player={findPlayer(players, view.buzzer)} size="lg" />
        </m.div>
      )}
      {state.phase === 'buzz' && <StageNote>Hit your buzzer!</StageNote>}
      {state.phase === 'reveal' && (
        <div className="flex items-center justify-center gap-4">
          {view.winner ? (
            <>
              <PlayerTag player={findPlayer(players, view.winner)} size="lg" />
              <PointsBadge points={POINTS} />
            </>
          ) : (
            <StageNote>Nobody got it!</StageNote>
          )}
        </div>
      )}
      {view.locked.length > 0 && state.phase !== 'reveal' && (
        <div className="flex flex-wrap justify-center gap-3">
          {view.locked.map((id) => (
            <span key={id} className="flex items-center gap-2 rounded-full bg-plum-deep px-3 py-1 text-lg">
              <Lock aria-hidden className="h-4 w-4" /> {findPlayer(players, id).name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
