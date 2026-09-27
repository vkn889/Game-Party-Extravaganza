'use client';

import { m } from 'framer-motion';
import { AudienceBadge, GameIntro, PlayerTag, PointsBadge, StageNote, StagePrompt, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { BET_LABELS, BETS, publicView, type StatSnoopState } from './logic';

function Meter({ guess, answer }: { guess: number | null; answer: number | null }) {
  return (
    <div className="relative mx-auto h-16 w-full max-w-5xl rounded-full bg-plum-deep" aria-label="Percentage meter">
      {[0, 25, 50, 75, 100].map((t) => (
        <span key={t} className="absolute -bottom-9 -translate-x-1/2 text-xl text-peach/70" style={{ left: `${t}%` }}>
          {t}%
        </span>
      ))}
      {guess != null && (
        <m.div
          className="absolute top-0 h-16 -translate-x-1/2"
          initial={{ left: '50%' }}
          animate={{ left: `${guess}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 16 }}
        >
          <span className="font-display flex h-16 min-w-24 items-center justify-center rounded-full bg-purple px-4 text-3xl font-bold text-peach shadow-card">
            {guess}%
          </span>
        </m.div>
      )}
      {answer != null && (
        <m.div className="absolute -top-20 -translate-x-1/2" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} style={{ left: `${answer}%` }}>
          <span className="font-display flex flex-col items-center text-3xl font-bold text-mint">
            {answer}%<span className="h-24 w-1.5 rounded bg-mint" />
          </span>
        </m.div>
      )}
    </div>
  );
}

export function HostView({ state }: HostViewProps<StatSnoopState>) {
  const view = publicView(state);
  if (state.phase === 'intro' || !view) return <GameIntro slug="stat-snoop" playerCount={state.players.length} />;
  const guesser = findPlayer(state.players, view.guesserId);
  return (
    <div className="flex w-full flex-col gap-10">
      <StagePrompt kicker={`Question ${view.index + 1} of ${view.total}`}>{view.question}</StagePrompt>
      <div className="flex justify-center">
        <PlayerTag player={guesser} size="lg" />
      </div>
      <div className="py-10">
        <Meter guess={view.guess} answer={view.answer} />
      </div>
      {state.phase === 'guess' && <StageNote>{guesser.name} is setting the guess on their phone…</StageNote>}
      {state.phase === 'bet' && <StageNote>Everyone else: will the real answer be higher or lower?</StageNote>}
      {state.phase === 'reveal' && view.bets && (
        <div className="mx-auto grid w-full max-w-5xl grid-cols-4 gap-4">
          {BETS.map((bet) => {
            const who = Object.keys(view.bets!).filter((id) => view.bets![id] === bet);
            return (
              <div key={bet} className="flex flex-col gap-2 rounded-2xl bg-plum-raised p-4">
                <p className="font-display text-2xl font-bold">{BET_LABELS[bet]}</p>
                {view.audienceBet === bet && <AudienceBadge />}
                {who.map((id) => (
                  <div key={id} className="flex items-center justify-between gap-2">
                    <PlayerTag player={findPlayer(state.players, id)} size="sm" />
                    <PointsBadge points={view.points?.[id] ?? 0} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {state.phase === 'reveal' && view.points && (
        <div className="flex justify-center">
          <span className="flex items-center gap-3 text-2xl">
            {guesser.name}&apos;s guess: <PointsBadge points={view.points[view.guesserId] ?? 0} />
          </span>
        </div>
      )}
    </div>
  );
}
