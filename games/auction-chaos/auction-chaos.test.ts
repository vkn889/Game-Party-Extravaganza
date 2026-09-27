import { describe, expect, it } from 'vitest';
import { HOUSE_ID } from '@/lib/engine/house';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { auctionChaos } from './index';
import * as logic from './logic';

const content = loadPacks(['auction-chaos']);
const toBidding = (n: number, seed: number) => logic.onTimerEnd(logic.onTimerEnd(logic.init(makePlayers(n), SETTINGS, content, seed)));

describe('Auction Chaos', () => {
  it('starts everyone with $1000 and validates bids', () => {
    let s = toBidding(4, 1);
    expect(s.phase).toBe('bidding');
    expect(Object.values(s.scores)).toEqual([1000, 1000, 1000, 1000]);
    const [a, b] = s.players.map((p) => p.id);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { amount: 15 } })).toBe(s);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { amount: 5000 } })).toBe(s);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { amount: 100 } });
    expect(s.highBidder).toBe(a);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { amount: 200 } })).toBe(s); // can't outbid yourself
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: b, round: r(s), payload: { amount: 100 } })).toBe(s); // must beat the high bid
    s = logic.onAction(s, { type: 'SUBMIT', playerId: b, round: r(s), payload: { amount: 150 } });
    expect(s.highBidder).toBe(b);
  });

  it('charges the winner and pays out the box value', () => {
    let s = toBidding(4, 2);
    const a = s.players[0].id;
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { amount: 200 } });
    s = logic.onTimerEnd(s);
    const box = s.boxes[0];
    expect(s.phase).toBe('sold');
    expect(s.scores[a]).toBe(1000 - 200 + box.value);
  });

  it('adds a House bidder with a hidden max for 2-3 players', () => {
    let s = toBidding(2, 3);
    expect(s.houseMax).not.toBeNull();
    expect(JSON.stringify(logic.publicView(s))).not.toContain(`"houseMax"`);
    const a = s.players[0].id;
    const houseMax = s.houseMax!;
    const bid = Math.max(logic.minNextBid(s), 10);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { amount: bid } });
    if (bid + 10 <= houseMax) {
      expect(s.highBidder).toBe(HOUSE_ID);
      expect(s.highBid).toBeLessThanOrEqual(houseMax);
    } else {
      expect(s.highBidder).toBe(a);
    }
    expect(toBidding(4, 3).houseMax).toBeNull();
  });

  it('keeps box contents secret until sold and plays 8 boxes', () => {
    const end = play(auctionChaos, logic.init(makePlayers(3), SETTINGS, content, 4), (s, id) =>
      s.phase === 'bidding' && s.highBidder !== id && logic.minNextBid(s) <= Math.min(300, s.scores[id])
        ? { type: 'SUBMIT', playerId: id, round: r(s), payload: { amount: logic.minNextBid(s) } }
        : null,
    { onStep: (s) => { if (s.phase === 'bidding' || s.phase === 'preview') expect(logic.publicView(s)?.sold).toBeNull(); } });
    expect(end.phase).toBe('done');
    expect(end.boxIndex).toBe(logic.BOXES - 1);
  });
});
