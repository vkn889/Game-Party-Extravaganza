'use client';

import { AnimatePresence, m } from 'framer-motion';
import { Bomb, Heart } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { GameIntro, StageNote, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { LIVES, publicView, type WordBombState } from './logic';

export function HostView({ state }: HostViewProps<WordBombState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro' || !view) return <GameIntro slug="word-bomb" playerCount={players.length} />;
  const active = findPlayer(players, view.activeId);
  const boom = state.phase === 'boom';
  return (
    <div className="flex w-full flex-col items-center gap-10">
      <div className="relative flex items-center justify-center">
        <m.div
          animate={boom ? { scale: [1, 1.6, 0.9], rotate: [0, 12, -8, 0] } : { scale: [1, 1.06, 1] }}
          transition={boom ? { duration: 0.6 } : { repeat: Infinity, duration: 0.9 }}
          className={`flex h-72 w-72 items-center justify-center rounded-full shadow-card ${boom ? 'bg-pink' : 'bg-plum-deep'}`}
        >
          <Bomb aria-hidden className={`absolute h-40 w-40 ${boom ? 'text-plum/30' : 'text-purple/40'}`} />
          <span className="font-display relative text-8xl font-bold tracking-wider text-peach" aria-label={`Letters: ${view.combo}`}>
            {view.combo}
          </span>
        </m.div>
      </div>
      {boom && view.boomId ? (
        <p className="font-display text-6xl font-bold text-pink">BOOM! {findPlayer(players, view.boomId).name} loses a life!</p>
      ) : (
        <p className="font-display text-5xl font-bold">
          <span className="text-pink">{active.name}</span>, type a word with {view.combo}!
        </p>
      )}
      <AnimatePresence mode="popLayout">
        {view.lastWord && (
          <m.p key={view.lastWord.word} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="text-3xl text-mint">
            {findPlayer(players, view.lastWord.playerId).name}: <span className="font-display font-bold uppercase">{view.lastWord.word}</span>
          </m.p>
        )}
      </AnimatePresence>
      <div className="flex flex-wrap justify-center gap-5">
        {view.order.map((id) => {
          const p = findPlayer(players, id);
          const lives = view.lives[id] ?? 0;
          const isActive = id === view.activeId && !boom;
          return (
            <div key={id} className={`flex flex-col items-center gap-2 rounded-3xl px-5 py-4 ${isActive ? 'animate-your-turn bg-pink text-plum' : 'bg-plum-raised'} ${lives === 0 ? 'opacity-40' : ''}`}>
              <Avatar name={p.name} color={p.color} size="lg" />
              <span className="font-display text-2xl font-semibold">{p.name}</span>
              <span className="flex gap-1" aria-label={`${lives} lives`}>
                {Array.from({ length: LIVES }, (_, i) => (
                  <Heart key={i} aria-hidden className={`h-6 w-6 ${i < lives ? 'fill-current' : 'opacity-30'}`} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <StageNote>{view.wordsUsed} words so far. The fuse is secret and getting shorter…</StageNote>
    </div>
  );
}
