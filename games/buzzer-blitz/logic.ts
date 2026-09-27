import { allConnectedSubmitted, createBase, display, gameClock, goTo, input, markSubmitted, payloadOf } from '@/lib/engine/base';
import { draw, rng, shuffle } from '@/lib/engine/rng';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const QUESTIONS = 10;
export const POINTS = 1000;
export const TIMERS = { intro: 7, buzz: 20, rebuzz: 12, answer: 8, reveal: 5 };

export interface BuzzQuestion {
  text: string;
  options: string[];
  correct: number;
}

export interface BuzzerBlitzState extends BaseGameState {
  questions: BuzzQuestion[];
  qIndex: number;
  locked: string[];
  buzzer: string | null;
  choice: number | null;
  winner: string | null;
  wrong: { playerId: string; choice: number | null }[];
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): BuzzerBlitzState {
  const rand = rng(seed, 'content');
  const questions = draw(
    (content['buzzer-blitz'] ?? []).filter((q) => q.answer),
    QUESTIONS,
    rand,
  ).map((q): BuzzQuestion => {
    const options = shuffle([q.answer!, ...(q.decoys ?? []).slice(0, 3)], rand);
    return { text: q.text, options, correct: options.indexOf(q.answer!) };
  });
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    questions,
    qIndex: 0,
    locked: [],
    buzzer: null,
    choice: null,
    winner: null,
    wrong: [],
  };
}

const ids = (s: BuzzerBlitzState) => s.players.map((p) => p.id);
const canBuzz = (s: BuzzerBlitzState) => ids(s).filter((id) => !s.locked.includes(id));

function startQuestion(s: BuzzerBlitzState, qIndex: number): BuzzerBlitzState {
  if (qIndex >= s.questions.length) return goTo(s, 'done', null);
  return goTo(s, 'buzz', input(TIMERS.buzz), { qIndex, round: qIndex + 1, locked: [], buzzer: null, choice: null, winner: null, wrong: [] });
}

function reveal(s: BuzzerBlitzState): BuzzerBlitzState {
  return goTo(s, 'reveal', display(TIMERS.reveal), { buzzer: null });
}

/** A wrong (or timed-out) answer locks the buzzer out for the rest of the question. */
function lockOut(s: BuzzerBlitzState, choice: number | null): BuzzerBlitzState {
  const who = s.buzzer!;
  const next = { ...s, locked: [...s.locked, who], wrong: [...s.wrong, { playerId: who, choice }], buzzer: null, choice: null };
  const stillIn = canBuzz(next).filter((id) => next.connected.includes(id));
  if (stillIn.length === 0) return reveal(next);
  return goTo(next, 'buzz', input(TIMERS.rebuzz));
}

export function onAction(s: BuzzerBlitzState, action: GameAction): BuzzerBlitzState {
  if (action.type !== 'SUBMIT') return s;
  const id = action.playerId;
  const payload = payloadOf(action.payload);
  if (s.phase === 'buzz' && payload.buzz === true && !s.locked.includes(id)) {
    // First buzz to reach the host wins; later ones quote a stale step and are dropped.
    return goTo(s, 'answer', gameClock(TIMERS.answer), { buzzer: id });
  }
  if (s.phase === 'answer' && id === s.buzzer && !s.submitted.includes(id)) {
    const choice = payload.choice;
    const q = s.questions[s.qIndex];
    if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return s;
    if (choice === q.correct) {
      const scores = { ...s.scores, [id]: s.scores[id] + POINTS };
      return reveal(markSubmitted({ ...s, choice, winner: id, scores }, id));
    }
    return lockOut(s, choice);
  }
  return s;
}

export function onTimerEnd(s: BuzzerBlitzState): BuzzerBlitzState {
  switch (s.phase) {
    case 'intro':
      return startQuestion(s, 0);
    case 'buzz':
      return reveal(s);
    case 'answer':
      return lockOut(s, null);
    case 'reveal':
      return startQuestion(s, s.qIndex + 1);
    default:
      return s;
  }
}

export function isStepComplete(s: BuzzerBlitzState): boolean {
  // Nobody left who can buzz: end the question early.
  if (s.phase === 'buzz') return canBuzz(s).filter((id) => s.connected.includes(id)).length === 0;
  if (s.phase === 'answer') return allConnectedSubmitted(s, s.buzzer ? [s.buzzer] : []);
  return false;
}

export interface BuzzerBlitzPublic {
  index: number;
  total: number;
  text: string;
  options: string[];
  locked: string[];
  buzzer: string | null;
  wrong: { playerId: string; choice: number | null }[];
  correct: number | null;
  winner: string | null;
}

export function publicView(s: BuzzerBlitzState): BuzzerBlitzPublic | null {
  const q = s.questions[s.qIndex];
  if (!q || s.phase === 'intro' || s.phase === 'done') return null;
  return {
    index: s.qIndex,
    total: s.questions.length,
    text: q.text,
    options: q.options,
    locked: s.locked,
    buzzer: s.buzzer,
    wrong: s.wrong,
    correct: s.phase === 'reveal' ? q.correct : null,
    winner: s.phase === 'reveal' ? s.winner : null,
  };
}

export function privateView(s: BuzzerBlitzState, playerId: string): { locked: boolean; isBuzzer: boolean } | null {
  if (s.phase !== 'buzz' && s.phase !== 'answer') return null;
  return { locked: s.locked.includes(playerId), isBuzzer: s.buzzer === playerId };
}

export function audienceVote(): AudienceVote | null {
  return null;
}

export function isOver(s: BuzzerBlitzState): boolean {
  return s.phase === 'done';
}
