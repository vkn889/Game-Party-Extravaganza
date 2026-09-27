'use client';

import { Button } from '@/components/shared/Button';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { PhoneTitle, YourTurn, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import { BID_STEPS, type AuctionChaosPublic } from './logic';

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<AuctionChaosPublic | null>(view);
  const mine = priv<{ cash: number; leading: boolean }>(view);
  if (!data || view.phase !== 'bidding' || !mine) return <LookAtScreen />;
  const bids = BID_STEPS.map((step) => (data.highBidder ? data.highBid + step : step));
  return (
    <div className="flex flex-col gap-4">
      <PhoneTitle sub={`You have $${mine.cash.toLocaleString()}`}>{data.name}</PhoneTitle>
      <p className="font-display text-center text-5xl font-bold text-pink" aria-live="polite">
        ${data.highBid.toLocaleString()}
      </p>
      {mine.leading ? (
        <YourTurn>You&apos;re the high bidder!</YourTurn>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {bids.map((amount, i) => (
            <Button
              key={i}
              size="lg"
              block
              variant={i === 0 ? 'primary' : 'secondary'}
              disabled={amount > mine.cash}
              onClick={() => send({ type: 'SUBMIT', payload: { amount } })}
            >
              Bid ${amount.toLocaleString()}
            </Button>
          ))}
        </div>
      )}
      {mine.cash < data.minBid && <p className="text-center text-peach/85">Not enough cash for this one.</p>}
    </div>
  );
}
