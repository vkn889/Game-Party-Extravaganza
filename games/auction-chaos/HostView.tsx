'use client';

import { m } from 'framer-motion';
import { Gift, Package, Skull } from 'lucide-react';
import { Counter } from '@/components/shared/Counter';
import { GameIntro, PlayerTag, StageNote, StagePrompt, findPlayer } from '@/games/shared/host';
import type { HostViewProps } from '@/lib/types';
import { publicView, type AuctionChaosState } from './logic';

const KIND = {
  jackpot: { label: 'JACKPOT!', icon: Gift, className: 'bg-mint text-plum' },
  dud: { label: 'A dud.', icon: Package, className: 'bg-peach text-plum' },
  cursed: { label: 'CURSED!', icon: Skull, className: 'bg-plum-deep text-pink' },
};

export function HostView({ state }: HostViewProps<AuctionChaosState>) {
  const view = publicView(state);
  const players = state.players;
  if (state.phase === 'intro' || !view) return <GameIntro slug="auction-chaos" playerCount={players.length} />;
  const sold = view.sold;
  const kind = sold ? KIND[sold.kind] : null;
  return (
    <div className="flex w-full flex-col items-center gap-8">
      <StagePrompt kicker={`Mystery box ${view.index + 1} of ${view.total}`}>{view.name}</StagePrompt>
      <m.div
        key={`${view.index}-${state.phase}`}
        initial={{ rotate: -4, scale: 0.9 }}
        animate={sold ? { rotate: 0, scale: 1.05 } : { rotate: [-2, 2, -2], scale: 1 }}
        transition={sold ? { type: 'spring' } : { repeat: Infinity, duration: 1.6 }}
        className={`flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-3xl shadow-card ${kind ? kind.className : 'bg-purple text-peach'}`}
      >
        {kind ? <kind.icon aria-hidden className="h-20 w-20" /> : <Package aria-hidden className="h-24 w-24" />}
        {kind && <span className="font-display text-3xl font-bold">{kind.label}</span>}
      </m.div>
      {sold ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-display text-4xl font-semibold">{sold.reveal}</p>
          <p className="font-display text-5xl font-bold text-mint">
            Worth {sold.value < 0 ? '−' : ''}${Math.abs(sold.value).toLocaleString()}
          </p>
          <StageNote>
            {sold.winnerId
              ? `${findPlayer(players, sold.winnerId).name} paid $${sold.price.toLocaleString()}`
              : 'Nobody bid. Unsold!'}
          </StageNote>
        </div>
      ) : state.phase === 'preview' ? (
        <StageNote>Jackpot, dud or cursed? Get ready to bid!</StageNote>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="font-display text-7xl font-bold text-pink">
            $<Counter value={view.highBid} />
          </p>
          {view.highBidder ? <PlayerTag player={findPlayer(players, view.highBidder)} size="lg" /> : <StageNote>No bids yet. Opening bid $10.</StageNote>}
          <div className="flex gap-3 text-xl text-peach/80">
            {view.history.slice(0, -1).reverse().map((h, i) => (
              <span key={i}>
                {findPlayer(players, h.bidderId).name} ${h.amount}
              </span>
            ))}
          </div>
          {view.houseBidding && <StageNote>The House is bidding too. How high will it go?</StageNote>}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-4">
        {players.map((p) => (
          <span key={p.id} className="flex items-center gap-2 rounded-full bg-plum-raised px-4 py-2">
            <PlayerTag player={p} size="sm" />
            <span className="font-display text-2xl font-bold text-mint">
              $<Counter value={state.scores[p.id] ?? 0} />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
