'use client';

import { m } from 'framer-motion';
import { Avatar } from '@/components/shared/Avatar';
import { AudienceBadge, GameIntro, PointsBadge, StageNote, StagePrompt, VoterDots, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { publicView, type MostLikelyToState } from './logic';

export function HostView({ state }: HostViewProps<MostLikelyToState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro' || !view) return <GameIntro slug="most-likely-to" playerCount={players.length} />;
  const r = view.reveal;
  return (
    <div className="flex w-full flex-col gap-10">
      <StagePrompt kicker={`${view.mode === 'meOrYou' ? 'Me or you?' : 'Most likely to'} · ${view.index + 1} of ${view.total}`}>{view.prompt}</StagePrompt>
      {!r && <StageNote>Vote on your phone. Nobody will see who voted for whom until the reveal.</StageNote>}
      <div className="mx-auto flex flex-wrap justify-center gap-6">
        {players.map((p, i) => {
          const votes = r ? Object.keys(r.votes).filter((v) => r.votes[v] === p.id) : [];
          const winner = r?.top.includes(p.id);
          return (
            <m.div
              key={p.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0, scale: winner ? 1.08 : 1 }}
              transition={{ delay: i * 0.05 }}
              className={`flex w-52 flex-col items-center gap-3 rounded-3xl p-5 shadow-card ${winner ? 'bg-pink text-plum' : 'bg-plum-raised'}`}
            >
              <Avatar name={p.name} color={p.color} size="xl" />
              <span className="font-display text-3xl font-bold">{p.name}</span>
              {r && (
                <>
                  <span className="font-display text-2xl">{votes.length + (r.audience === p.id ? 1 : 0)} votes</span>
                  <VoterDots voters={votes.map((v) => findPlayer(players, v))} />
                  {r.audience === p.id && <AudienceBadge />}
                  <PointsBadge points={r.points[p.id] ?? 0} />
                </>
              )}
            </m.div>
          );
        })}
      </div>
    </div>
  );
}
