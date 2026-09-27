'use client';

import { m } from 'framer-motion';
import { GameIntro, PlayerTag, PointsBadge, StageNote, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { publicView, type EmojiDecodeState } from './logic';

export function HostView({ state }: HostViewProps<EmojiDecodeState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro' || !view) return <GameIntro slug="emoji-decode" playerCount={players.length} />;
  return (
    <div className="flex w-full flex-col items-center gap-8">
      <p className="font-display text-2xl font-semibold uppercase tracking-wide text-mint">
        Puzzle {view.index + 1} of {view.total} · {view.category}
      </p>
      <m.p key={view.index} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[112px] leading-none" aria-label={`Emoji clue for a ${view.category}`}>
        {view.emojis}
      </m.p>
      <p className="font-display text-5xl font-bold tracking-[0.2em]" aria-label="Answer length">
        {view.answer ?? view.mask}
      </p>
      {state.phase === 'guess' && <StageNote>Type your guess on your phone. Typos are forgiven!</StageNote>}
      <div className="flex flex-wrap justify-center gap-4">
        {view.solved.map((id, i) => (
          <m.span key={id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-2 rounded-full bg-plum-raised px-4 py-2">
            <span className="font-display text-2xl font-bold text-mint">#{i + 1}</span>
            <PlayerTag player={findPlayer(players, id)} size="sm" />
            <PointsBadge points={view.points[id] ?? 0} />
          </m.span>
        ))}
      </div>
    </div>
  );
}
