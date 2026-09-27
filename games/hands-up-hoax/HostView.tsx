'use client';

import { m } from 'framer-motion';
import { AudienceBadge, GameIntro, PlayerTag, PointsBadge, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { KIND_LABELS, publicView, type HandsUpHoaxState } from './logic';

export function HostView({ state }: HostViewProps<HandsUpHoaxState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro' || !view) return <GameIntro slug="hands-up-hoax" playerCount={players.length} />;
  const kicker = `Task ${view.index + 1} of ${view.total} · ${view.kind ? KIND_LABELS[view.kind] : ''}`;

  if (state.phase === 'task') {
    return (
      <div className="flex flex-col gap-6">
        <StagePrompt kicker={kicker}>Read your secret task. Don&apos;t show anyone!</StagePrompt>
        <StageNote>{view.mode === 'classic' ? 'One of you is faking it.' : 'There might be 0, 1 or 2 fakers. Or not.'}</StageNote>
      </div>
    );
  }
  if (state.phase === 'act') {
    return (
      <m.div initial={{ scale: 0.8 }} animate={{ scale: [0.8, 1.1, 1] }} className="flex flex-col items-center gap-6">
        <StagePrompt kicker={kicker}>Do it now, all together!</StagePrompt>
        <StageNote>Hold it… look around… who&apos;s faking?</StageNote>
      </m.div>
    );
  }
  if (state.phase === 'vote') {
    return (
      <div className="flex flex-col gap-6">
        <StagePrompt kicker={kicker}>{view.mode === 'classic' ? 'Who is the faker?' : 'Who was faking?'}</StagePrompt>
        <StageNote>Discuss, then vote on your phone.</StageNote>
      </div>
    );
  }

  const r = view.reveal;
  if (!r) return null;
  return (
    <div className="flex w-full flex-col gap-8">
      <StagePrompt kicker="The task was">{r.task}</StagePrompt>
      <div className="flex flex-col items-center gap-3">
        <p className="font-display text-3xl font-bold text-pink">
          {r.fakers.length === 0 ? 'Nobody was faking!' : r.fakers.length === 1 ? 'The faker was' : 'The fakers were'}
        </p>
        <div className="flex gap-6">
          {r.fakers.map((id) => (
            <m.span key={id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
              <PlayerTag player={findPlayer(players, id)} size="lg" />
            </m.span>
          ))}
        </div>
        {view.mode === 'classic' && (
          <StageNote>{r.accused === r.fakers[0] ? 'Caught!' : r.accused ? `The group accused ${findPlayer(players, r.accused).name}.` : 'The group couldn’t agree.'}</StageNote>
        )}
      </div>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-4 xl:grid-cols-4">
        {players.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-2xl bg-plum-raised p-4">
            <div className="flex items-center justify-between">
              <PlayerTag player={p} size="sm" />
              <PointsBadge points={r.points[p.id] ?? 0} />
            </div>
            {view.mode === 'classic' ? (
              <>
                <VoterDots voters={Object.keys(r.votes).filter((v) => r.votes[v] === p.id).map((v) => findPlayer(players, v))} />
                {r.audience === p.id && <AudienceBadge />}
              </>
            ) : (
              <p className="text-lg text-peach/85">
                {Object.entries(r.guesses[p.id] ?? {})
                  .map(([target, faking]) => `${findPlayer(players, target).name}: ${faking ? 'faking' : 'legit'}`)
                  .join(' · ') || 'No guesses'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
