'use client';

/* eslint-disable @next/next/no-img-element */
import { m } from 'framer-motion';
import { AudienceBadge, GameIntro, PlayerTag, PointsBadge, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { publicView, type DoodleTelephoneState } from './logic';

export function HostView({ state }: HostViewProps<DoodleTelephoneState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro') return <GameIntro slug="doodle-telephone" playerCount={players.length} />;
  if (state.phase === 'write' || state.phase === 'draw' || state.phase === 'describe') {
    const copy = { write: 'Write a weird sentence!', draw: 'Draw what you read!', describe: 'Describe what you see!' }[state.phase];
    return (
      <div className="flex flex-col gap-6">
        <StagePrompt kicker={`Step ${view.link + 1} of ${view.chainLength}`}>{copy}</StagePrompt>
        <StageNote>Books pass to the next player each step. No peeking!</StageNote>
      </div>
    );
  }
  if (!view.book) return null;
  const book = view.book;
  const voteCounts: Record<string, string[]> = {};
  for (const [voter, entry] of Object.entries(view.votes ?? {})) (voteCounts[entry] ??= []).push(voter);
  return (
    <div className="flex w-full flex-col gap-6">
      <StagePrompt kicker={`Book ${view.bookIndex + 1} of ${view.bookCount}`}>
        {findPlayer(players, book.ownerId).name}&apos;s book
      </StagePrompt>
      <div className="no-scrollbar flex w-full items-stretch gap-5 overflow-x-auto pb-4">
        {book.entries.map((e, i) => (
          <m.div
            key={i}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex w-80 shrink-0 flex-col gap-3 rounded-3xl bg-peach p-4 text-plum shadow-card"
          >
            <div className="flex items-center justify-between">
              <PlayerTag player={findPlayer(players, e.authorId)} size="sm" />
              <span className="text-lg font-semibold">Step {i + 1}</span>
            </div>
            {e.missing ? (
              <p className="flex flex-1 items-center justify-center text-2xl italic opacity-60">(skipped)</p>
            ) : e.kind === 'drawing' ? (
              <img src={e.content} alt={`Drawing by ${findPlayer(players, e.authorId).name}`} className="aspect-square w-full rounded-2xl bg-white" />
            ) : (
              <p className="font-display flex flex-1 items-center text-3xl font-semibold leading-tight">“{e.content}”</p>
            )}
            {view.votes && (
              <div className="flex flex-wrap items-center gap-2">
                <VoterDots voters={(voteCounts[String(i)] ?? []).map((v) => findPlayer(players, v))} />
                {view.audience === String(i) && <AudienceBadge />}
              </div>
            )}
          </m.div>
        ))}
      </div>
      {state.phase === 'bookVote' && <StageNote>Vote for the best link on your phone!</StageNote>}
      {view.points && (
        <div className="flex flex-wrap justify-center gap-4">
          {Object.entries(view.points).map(([id, pts]) => (
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
