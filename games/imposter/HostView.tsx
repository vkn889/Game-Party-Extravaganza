'use client';

import { m } from 'framer-motion';
import { AudienceBadge, GameIntro, OptionCard, PlayerTag, PointsBadge, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import type { HostViewProps, Player } from '@/lib/types';
import { publicView, type Clue, type ImposterState } from './logic';

function ClueList({ clues, players, activeId }: { clues: Clue[]; players: Player[]; activeId: string | null }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-3 xl:grid-cols-3">
      {clues.map((c, i) => (
        <m.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-2xl bg-plum-raised px-4 py-3">
          <PlayerTag player={findPlayer(players, c.playerId)} size="sm" />
          <span className={`font-display ml-auto text-3xl font-bold ${c.passed ? 'text-peach/50 italic' : 'text-peach'}`}>{c.passed ? 'passed' : c.text}</span>
        </m.div>
      ))}
      {activeId && (
        <div className="flex animate-pulse items-center gap-3 rounded-2xl border-2 border-dashed border-pink px-4 py-3">
          <PlayerTag player={findPlayer(players, activeId)} size="sm" />
          <span className="ml-auto text-xl text-pink">thinking…</span>
        </div>
      )}
    </div>
  );
}

export function HostView({ state }: HostViewProps<ImposterState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro' || !view) return <GameIntro slug="imposter" playerCount={players.length} />;
  const kicker = `Round ${view.roundIndex + 1} of ${view.totalRounds} · Category: ${view.category}`;

  if (state.phase === 'secret') {
    return (
      <div className="flex flex-col gap-6">
        <StagePrompt kicker={kicker}>Check your phone for your secret word.</StagePrompt>
        <StageNote>{view.mode === 'classic' ? 'One of you is the imposter and has no word.' : 'Some of you have a different, similar word. Maybe.'}</StageNote>
      </div>
    );
  }
  if (state.phase === 'clue' || state.phase === 'vote' || state.phase === 'judge') {
    return (
      <div className="flex w-full flex-col gap-8">
        <StagePrompt kicker={kicker}>
          {state.phase === 'clue'
            ? `Clue ${view.turn + 1} of ${view.turns}: one word each`
            : state.phase === 'vote'
              ? 'Who is the imposter? Vote now!'
              : 'Do you share a word? Decide on your phone!'}
        </StagePrompt>
        <ClueList clues={view.clues} players={players} activeId={view.activeId} />
      </div>
    );
  }
  if (state.phase === 'guess' && view.options && view.imposterId) {
    return (
      <div className="flex w-full flex-col gap-8">
        <StagePrompt kicker="Caught!">
          {findPlayer(players, view.imposterId).name} can still win by guessing the word…
        </StagePrompt>
        <div className="mx-auto grid w-full max-w-5xl grid-cols-4 gap-4">
          {view.options.map((o, i) => (
            <OptionCard key={o} index={i} label={o} />
          ))}
        </div>
      </div>
    );
  }

  const r = view.reveal;
  if (!r) return null;
  if (view.mode === 'double') {
    return (
      <div className="flex w-full flex-col gap-8">
        <StagePrompt kicker={kicker}>
          The words were “{r.word}” and “{r.decoy}”
        </StagePrompt>
        <div className="mx-auto grid w-full max-w-5xl grid-cols-3 gap-4">
          {players.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-2xl bg-plum-raised p-4">
              <div className="flex items-center justify-between">
                <PlayerTag player={p} size="sm" />
                <PointsBadge points={r.points[p.id] ?? 0} />
              </div>
              <p className="font-display text-3xl font-bold">{r.assignments?.[p.id] === 'decoy' ? r.decoy : r.word}</p>
              <p className="text-lg text-peach/80">
                {Object.entries(r.judgements?.[p.id] ?? {})
                  .map(([t, same]) => `${findPlayer(players, t).name}: ${same ? 'same' : 'different'}`)
                  .join(' · ') || 'No calls'}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const caught = r.accused != null && r.accused === r.imposterId;
  return (
    <div className="flex w-full flex-col gap-8">
      <StagePrompt kicker={kicker}>
        {state.phase === 'guessReveal'
          ? r.guess && r.guess === r.word
            ? `The imposter guessed “${r.word}” and steals the win!`
            : `The word was “${r.word}”. The crew wins!`
          : caught
            ? 'You caught the imposter!'
            : `The imposter escaped! The word was “${r.word}”.`}
      </StagePrompt>
      {r.imposterId && (
        <div className="flex justify-center">
          <m.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="flex items-center gap-4 rounded-3xl bg-pink px-6 py-3 text-plum">
            <span className="font-display text-2xl font-bold">Imposter:</span>
            <PlayerTag player={findPlayer(players, r.imposterId)} size="lg" />
          </m.span>
        </div>
      )}
      {state.phase === 'voteReveal' && (
        <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-3 xl:grid-cols-4">
          {players.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-2xl bg-plum-raised p-3">
              <PlayerTag player={p} size="sm" />
              <VoterDots voters={Object.keys(r.votes).filter((v) => r.votes[v] === p.id).map((v) => findPlayer(players, v))} />
              {r.audience === p.id && <AudienceBadge />}
            </div>
          ))}
        </div>
      )}
      {Object.keys(r.points).length > 0 && (
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
