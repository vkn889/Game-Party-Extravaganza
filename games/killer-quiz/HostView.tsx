'use client';

import { m } from 'framer-motion';
import { Ghost, Skull } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { GameIntro, OptionCard, PlayerTag, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import type { HostViewProps, Player } from '@/lib/types';
import { SYMBOLS, publicView, type KillerQuizState } from './logic';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MINIGAME_COPY = {
  dice: { title: 'Dice of Doom', rule: 'Pick 3 numbers. If the die lands on one of yours, you live.' },
  memory: { title: 'Memory Maze', rule: 'Memorize the symbols, then enter them in order.' },
  math: { title: 'Math Panic', rule: 'Solve at least 2 of 3 problems before time runs out.' },
};

function LifeStrip({ players, alive }: { players: Player[]; alive: Record<string, boolean> }) {
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {players.map((p) => (
        <span key={p.id} className="flex items-center gap-2 rounded-full bg-plum-raised px-3 py-1">
          <Avatar name={p.name} color={p.color} size="sm" dimmed={!alive[p.id]} />
          <span className="text-lg">{p.name}</span>
          {!alive[p.id] && <Ghost aria-label="ghost" className="h-5 w-5 text-mint" />}
        </span>
      ))}
    </div>
  );
}

function Track({ players, positions, finish, moves }: { players: Player[]; positions: Record<string, number>; finish: number; moves: Record<string, number> | null }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3" aria-label="Race to the exit">
      {players.map((p) => (
        <div key={p.id} className="flex items-center gap-4">
          <span className="w-40 truncate text-right text-2xl font-semibold">{p.name}</span>
          <div className="relative grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${finish + 1}, minmax(0, 1fr))` }}>
            {Array.from({ length: finish + 1 }, (_, i) => (
              <span key={i} className={`h-12 rounded-lg ${i === finish ? 'bg-mint' : 'bg-plum-raised'}`} />
            ))}
            <m.span
              className="absolute top-0 flex h-12 items-center justify-center"
              style={{ width: `${100 / (finish + 1)}%` }}
              initial={false}
              animate={{ left: `${((positions[p.id] ?? 0) / (finish + 1)) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            >
              <Avatar name={p.name} color={p.color} size="md" />
            </m.span>
          </div>
          <span className="font-display w-16 text-2xl font-bold text-pink">{moves && moves[p.id] ? `+${moves[p.id]}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

export function HostView({ state }: HostViewProps<KillerQuizState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro') return <GameIntro slug="killer-quiz" playerCount={players.length} />;

  if (view.question) {
    const q = view.question;
    return (
      <div className="flex w-full flex-col gap-8">
        <StagePrompt kicker={`Question ${q.index + 1} of ${q.total}`}>{q.text}</StagePrompt>
        <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-5">
          {q.options.map((o, i) => (
            <OptionCard
              key={i}
              index={i}
              label={`${LETTERS[i]}. ${o}`}
              highlight={q.correct === i}
              dim={q.correct != null && q.correct !== i}
            >
              {view.answers && <VoterDots voters={players.filter((p) => view.answers![p.id] === i)} />}
            </OptionCard>
          ))}
        </div>
        {state.phase === 'questionReveal' && view.atRisk.length > 0 ? (
          <div className="flex flex-col items-center gap-3">
            <p className="font-display text-4xl font-bold text-pink">Wrong answer. Time to face death!</p>
            <div className="flex gap-4">{view.atRisk.map((id) => <PlayerTag key={id} player={findPlayer(players, id)} />)}</div>
          </div>
        ) : (
          <LifeStrip players={players} alive={view.alive} />
        )}
      </div>
    );
  }

  if (view.minigame) {
    const g = view.minigame;
    const copy = MINIGAME_COPY[g.kind];
    return (
      <div className="flex w-full flex-col items-center gap-8">
        <StagePrompt kicker="Death minigame">{copy.title}</StagePrompt>
        {state.phase === 'deathIntro' && <StageNote>{copy.rule}</StageNote>}
        <div className="flex flex-wrap justify-center gap-4">
          {view.atRisk.map((id) => (
            <PlayerTag key={id} player={findPlayer(players, id)} size="lg" />
          ))}
        </div>
        {state.phase === 'dice' && <StageNote>Pick 3 numbers on your phone!</StageNote>}
        {g.sequence && state.phase === 'memoryShow' && (
          <div className="flex gap-6" aria-label="Sequence to memorize">
            {g.sequence.map((n, i) => (
              <m.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.35 }} className="font-display flex h-32 w-32 items-center justify-center rounded-3xl bg-peach text-7xl text-plum shadow-card">
                {SYMBOLS[n]}
              </m.span>
            ))}
          </div>
        )}
        {state.phase === 'memoryInput' && <StageNote>Enter the sequence on your phone!</StageNote>}
        {g.problems && state.phase === 'math' && (
          <div className="flex gap-6">
            {g.problems.map((p) => (
              <span key={p} className="font-display rounded-3xl bg-peach px-8 py-6 text-6xl font-bold text-plum shadow-card">
                {p}
              </span>
            ))}
          </div>
        )}
        {state.phase === 'deathReveal' && (
          <div className="flex flex-col items-center gap-6">
            {g.kind === 'dice' && g.roll != null && (
              <m.span initial={{ rotate: -180, scale: 0 }} animate={{ rotate: 0, scale: 1 }} className="font-display flex h-36 w-36 items-center justify-center rounded-3xl bg-peach text-8xl font-bold text-plum shadow-card">
                {g.roll}
              </m.span>
            )}
            {g.kind === 'memory' && g.sequence && (
              <div className="flex gap-3">{g.sequence.map((n, i) => <span key={i} className="text-6xl">{SYMBOLS[n]}</span>)}</div>
            )}
            {view.died && view.died.length > 0 ? (
              <div className="flex flex-col items-center gap-3">
                <p className="font-display flex items-center gap-3 text-5xl font-bold text-pink">
                  <Skull aria-hidden className="h-12 w-12" /> New ghosts
                </p>
                <div className="flex gap-4">{view.died.map((id) => <PlayerTag key={id} player={findPlayer(players, id)} size="lg" />)}</div>
              </div>
            ) : (
              <p className="font-display text-5xl font-bold text-mint">Everyone survived!</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (view.finale) {
    const f = view.finale;
    return (
      <div className="flex w-full flex-col gap-8">
        {state.phase === 'finaleIntro' ? (
          <>
            <StagePrompt kicker="The finale">Race to the exit!</StagePrompt>
            <StageNote>
              The living start ahead; ghosts start at the back. Pick every correct answer to move forward. First to the exit escapes and wins.
            </StageNote>
          </>
        ) : (
          <>
            <StagePrompt kicker={`Escape question ${f.index + 1}`}>{f.text}</StagePrompt>
            <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-4">
              {f.options.map((o, i) => (
                <OptionCard key={i} index={i} label={`${LETTERS[i]}. ${o.label}`} highlight={o.correct === true} dim={o.correct === false} />
              ))}
            </div>
          </>
        )}
        <Track players={players} positions={f.positions} finish={f.finish} moves={f.moves} />
        {f.exited.length > 0 && <StageNote>{f.exited.map((id) => findPlayer(players, id).name).join(' and ')} escaped!</StageNote>}
      </div>
    );
  }
  return null;
}
