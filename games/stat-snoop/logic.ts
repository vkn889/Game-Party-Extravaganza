import {
  allConnectedSubmitted,
  createBase,
  display,
  goTo,
  input,
  markSubmitted,
  payloadOf,
} from '@/lib/engine/base';
import { draw, rng, shuffle } from '@/lib/engine/rng';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const TIMERS = { intro: 7, guess: 30, bet: 20, reveal: 8 };
export const MUCH = 15; // "much higher/lower" means more than 15 points away
export const BETS = ['muchHigher', 'higher', 'lower', 'muchLower'] as const;
export type Bet = (typeof BETS)[number];
export const BET_LABELS: Record<Bet, string> = {
  muchHigher: 'Much higher',
  higher: 'Higher',
  lower: 'Lower',
  muchLower: 'Much lower',
};

export interface StatSnoopState extends BaseGameState {
  questions: { text: string; answer: number }[];
  qIndex: number;
  order: string[]; // guesser for each question
  guess: number | null;
  bets: Record<string, Bet>;
  audienceBet: Bet | null;
  lastPoints: Record<string, number>;
}

/** Questions per game: every player guesses at least once, twice in smaller groups. */
export function questionCount(players: number): number {
  return players <= 4 ? players * (players === 2 ? 3 : 2) : players;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): StatSnoopState {
  const count = questionCount(players.length);
  const rand = rng(seed, 'content');
  const questions = draw(
    (content['stat-snoop'] ?? []).filter((q) => q.answer != null && !Number.isNaN(Number(q.answer))),
    count,
    rand,
  ).map((q) => ({ text: q.text, answer: Math.round(Number(q.answer)) }));
  const rotation = shuffle(
    players.map((p) => p.id),
    rand,
  );
  const order = Array.from({ length: questions.length }, (_, i) => rotation[i % rotation.length]);
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    questions,
    qIndex: 0,
    order,
    guess: null,
    bets: {},
    audienceBet: null,
    lastPoints: {},
  };
}

const guesserOf = (s: StatSnoopState) => s.order[s.qIndex];
const bettors = (s: StatSnoopState) => s.players.map((p) => p.id).filter((id) => id !== guesserOf(s));

/** True when the bet is right given the guess and the real answer. */
export function betWins(bet: Bet, guess: number, answer: number): boolean {
  const diff = answer - guess;
  switch (bet) {
    case 'higher':
      return diff > 0;
    case 'lower':
      return diff < 0;
    case 'muchHigher':
      return diff > MUCH;
    case 'muchLower':
      return diff < -MUCH;
  }
}

export function guesserPoints(guess: number, answer: number): number {
  const diff = Math.abs(guess - answer);
  if (diff === 0) return 1500;
  return Math.max(0, 1000 - diff * 40);
}

function startQuestion(s: StatSnoopState, qIndex: number): StatSnoopState {
  return goTo(s, 'guess', input(TIMERS.guess), { qIndex, guess: null, bets: {}, audienceBet: null, lastPoints: {}, round: qIndex + 1 });
}

function reveal(s: StatSnoopState): StatSnoopState {
  const q = s.questions[s.qIndex];
  const guess = s.guess ?? 50;
  const lastPoints: Record<string, number> = {};
  lastPoints[guesserOf(s)] = guesserPoints(guess, q.answer);
  for (const [id, bet] of Object.entries(s.bets)) {
    lastPoints[id] = betWins(bet, guess, q.answer) ? (bet.startsWith('much') ? 1000 : 500) : 0;
  }
  const scores = { ...s.scores };
  for (const [id, pts] of Object.entries(lastPoints)) if (id in scores) scores[id] += pts;
  return goTo(s, 'reveal', display(TIMERS.reveal), { lastPoints, scores, guess });
}

export function onAction(s: StatSnoopState, action: GameAction): StatSnoopState {
  if (action.type === 'AUDIENCE_VOTE') {
    return s.phase === 'bet' && (BETS as readonly string[]).includes(action.choiceId) ? { ...s, audienceBet: action.choiceId as Bet } : s;
  }
  if (s.submitted.includes(action.playerId)) return s;
  if (action.type === 'SUBMIT' && s.phase === 'guess' && action.playerId === guesserOf(s)) {
    const value = payloadOf(action.payload).value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return s;
    const guess = Math.min(100, Math.max(0, Math.round(value)));
    return markSubmitted({ ...s, guess }, action.playerId);
  }
  if (action.type === 'VOTE' && s.phase === 'bet' && bettors(s).includes(action.playerId)) {
    if (!(BETS as readonly string[]).includes(action.choiceId)) return s;
    return markSubmitted({ ...s, bets: { ...s.bets, [action.playerId]: action.choiceId as Bet } }, action.playerId);
  }
  return s;
}

export function onTimerEnd(s: StatSnoopState): StatSnoopState {
  switch (s.phase) {
    case 'intro':
      return s.questions.length ? startQuestion(s, 0) : goTo(s, 'done', null);
    case 'guess':
      // An absent guesser defaults to 50%.
      return goTo(s, 'bet', input(TIMERS.bet), { guess: s.guess ?? 50 });
    case 'bet':
      return reveal(s);
    case 'reveal':
      return s.qIndex + 1 < s.questions.length ? startQuestion(s, s.qIndex + 1) : goTo(s, 'done', null);
    default:
      return s;
  }
}

export function isStepComplete(s: StatSnoopState): boolean {
  if (s.phase === 'guess') return allConnectedSubmitted(s, [guesserOf(s)]);
  if (s.phase === 'bet') return allConnectedSubmitted(s, bettors(s));
  return false;
}

export interface StatSnoopPublic {
  index: number;
  total: number;
  question: string;
  guesserId: string;
  guess: number | null;
  answer: number | null;
  bets: Record<string, Bet> | null;
  audienceBet: Bet | null;
  points: Record<string, number> | null;
}

export function publicView(s: StatSnoopState): StatSnoopPublic | null {
  const q = s.questions[s.qIndex];
  if (!q || s.phase === 'intro' || s.phase === 'done') return null;
  const revealed = s.phase === 'reveal';
  return {
    index: s.qIndex,
    total: s.questions.length,
    question: q.text,
    guesserId: guesserOf(s),
    guess: s.phase === 'guess' ? null : s.guess,
    answer: revealed ? q.answer : null,
    bets: revealed ? s.bets : null,
    audienceBet: revealed ? s.audienceBet : null,
    points: revealed ? s.lastPoints : null,
  };
}

export type StatSnoopPrivate = { role: 'guesser' | 'bettor'; done: boolean; bet: Bet | null };

export function privateView(s: StatSnoopState, playerId: string): StatSnoopPrivate | null {
  if (s.phase !== 'guess' && s.phase !== 'bet') return null;
  return {
    role: guesserOf(s) === playerId ? 'guesser' : 'bettor',
    done: s.submitted.includes(playerId),
    bet: s.bets[playerId] ?? null,
  };
}

export function audienceVote(s: StatSnoopState): AudienceVote | null {
  if (s.phase !== 'bet') return null;
  return {
    prompt: `${s.questions[s.qIndex].text} Guess: ${s.guess ?? 50}%`,
    options: BETS.map((b) => ({ id: b, label: BET_LABELS[b] })),
  };
}

export function isOver(s: StatSnoopState): boolean {
  return s.phase === 'done';
}
