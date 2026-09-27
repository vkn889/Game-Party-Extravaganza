import { createBase, display, gameClock, goTo, payloadOf, randFor } from '@/lib/engine/base';
import { HOUSE_ID, isSmallGroup } from '@/lib/engine/house';
import { draw, randInt, rng } from '@/lib/engine/rng';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const BOXES = 8;
export const STARTING_CASH = 1000;
export const MIN_BID = 10;
export const BID_STEPS = [10, 50, 100] as const;
export const TIMERS = { intro: 8, preview: 5, bidding: 15, afterBid: 6, sold: 7 };

export type BoxKind = 'jackpot' | 'dud' | 'cursed';

export interface MysteryBox {
  name: string;
  kind: BoxKind;
  value: number;
  reveal: string;
}

export interface AuctionChaosState extends BaseGameState {
  small: boolean;
  boxes: MysteryBox[];
  boxIndex: number;
  highBid: number;
  highBidder: string | null;
  history: { bidderId: string; amount: number }[];
  houseMax: number | null;
  sold: { winnerId: string | null; price: number } | null;
}

function asKind(value: string | null | undefined): BoxKind {
  return value === 'jackpot' || value === 'cursed' ? value : 'dud';
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): AuctionChaosState {
  const boxes = draw(content['auction-chaos'] ?? [], BOXES, rng(seed, 'content')).map((b): MysteryBox => {
    const kind = asKind(b.answer);
    const raw = Number(b.decoys?.[0] ?? 0);
    return { name: b.text, kind, value: Number.isFinite(raw) ? Math.round(raw) : 0, reveal: b.decoys?.[1] ?? '' };
  });
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    scores: Object.fromEntries(players.map((p) => [p.id, STARTING_CASH])),
    small: isSmallGroup(players.length),
    boxes,
    boxIndex: 0,
    highBid: 0,
    highBidder: null,
    history: [],
    houseMax: null,
    sold: null,
  };
}

const round10 = (n: number) => Math.max(MIN_BID, Math.round(n / 10) * 10);

/** The House's hidden ceiling: it has a hunch about each box, but not a perfect one. */
export function houseCeiling(box: MysteryBox, rand: () => number): number {
  switch (box.kind) {
    case 'jackpot':
      return round10(box.value * (0.4 + rand() * 0.4));
    case 'dud':
      return round10(20 + rand() * 100);
    case 'cursed':
      return round10(30 + rand() * 120);
  }
}

function startBox(s: AuctionChaosState, boxIndex: number): AuctionChaosState {
  if (boxIndex >= s.boxes.length) return goTo(s, 'done', null);
  return goTo(s, 'preview', display(TIMERS.preview), { boxIndex, round: boxIndex + 1, highBid: 0, highBidder: null, history: [], houseMax: null, sold: null });
}

function startBidding(s: AuctionChaosState): AuctionChaosState {
  let next = goTo(s, 'bidding', gameClock(TIMERS.bidding));
  if (s.small) {
    const rand = randFor(next, 'house');
    const houseMax = houseCeiling(s.boxes[s.boxIndex], rand);
    next = { ...next, houseMax };
    // Sometimes the House opens the bidding to get things going.
    if (rand() < 0.5 && houseMax >= 50) next = { ...next, highBid: 50, highBidder: HOUSE_ID, history: [{ bidderId: HOUSE_ID, amount: 50 }] };
  }
  return next;
}

export function minNextBid(s: AuctionChaosState): number {
  return s.highBidder ? s.highBid + MIN_BID : MIN_BID;
}

export function onAction(s: AuctionChaosState, action: GameAction): AuctionChaosState {
  if (action.type !== 'SUBMIT' || s.phase !== 'bidding') return s;
  const id = action.playerId;
  const amount = payloadOf(action.payload).amount;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount % 10 !== 0) return s;
  if (id === s.highBidder || amount < minNextBid(s) || amount > (s.scores[id] ?? 0)) return s;

  // A new high bid restarts the "going once, going twice" clock.
  let next = goTo(s, 'bidding', gameClock(TIMERS.afterBid), {
    highBid: amount,
    highBidder: id,
    history: [...s.history, { bidderId: id, amount }],
  });
  if (s.houseMax != null && amount + MIN_BID <= s.houseMax) {
    const counter = Math.min(s.houseMax, round10(amount + randInt(randFor(next, 'counter'), 1, 5) * 10));
    next = { ...next, highBid: counter, highBidder: HOUSE_ID, history: [...next.history, { bidderId: HOUSE_ID, amount: counter }] };
  }
  return next;
}

function sell(s: AuctionChaosState): AuctionChaosState {
  const box = s.boxes[s.boxIndex];
  const scores = { ...s.scores };
  if (s.highBidder && s.highBidder !== HOUSE_ID && s.highBidder in scores) {
    scores[s.highBidder] = scores[s.highBidder] - s.highBid + box.value;
  }
  return goTo(s, 'sold', display(TIMERS.sold), { scores, sold: { winnerId: s.highBidder, price: s.highBid } });
}

export function onTimerEnd(s: AuctionChaosState): AuctionChaosState {
  switch (s.phase) {
    case 'intro':
      return startBox(s, 0);
    case 'preview':
      return startBidding(s);
    case 'bidding':
      return sell(s);
    case 'sold':
      return startBox(s, s.boxIndex + 1);
    default:
      return s;
  }
}

export function isStepComplete(): boolean {
  return false; // bidding always runs down the clock
}

export interface AuctionChaosPublic {
  index: number;
  total: number;
  name: string;
  highBid: number;
  highBidder: string | null;
  minBid: number;
  history: { bidderId: string; amount: number }[];
  houseBidding: boolean;
  sold: { winnerId: string | null; price: number; kind: BoxKind; value: number; reveal: string } | null;
}

export function publicView(s: AuctionChaosState): AuctionChaosPublic | null {
  const box = s.boxes[s.boxIndex];
  if (!box || s.phase === 'intro' || s.phase === 'done') return null;
  return {
    index: s.boxIndex,
    total: s.boxes.length,
    name: box.name,
    highBid: s.highBid,
    highBidder: s.highBidder,
    minBid: minNextBid(s),
    history: s.history.slice(-6),
    houseBidding: s.small,
    // Contents stay sealed until the hammer falls; the House's ceiling is never shown.
    sold: s.phase === 'sold' && s.sold ? { ...s.sold, kind: box.kind, value: box.value, reveal: box.reveal } : null,
  };
}

export function privateView(s: AuctionChaosState, playerId: string): { cash: number; leading: boolean } | null {
  if (s.phase !== 'bidding') return null;
  return { cash: s.scores[playerId] ?? 0, leading: s.highBidder === playerId };
}

export function audienceVote(): AudienceVote | null {
  return null;
}

export function isOver(s: AuctionChaosState): boolean {
  return s.phase === 'done';
}
