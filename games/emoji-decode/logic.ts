import { allConnectedSubmitted, cleanText, createBase, display, goTo, input, markSubmitted, payloadOf } from '@/lib/engine/base';
import { draw, rng } from '@/lib/engine/rng';
import { isFuzzyMatch } from '@/lib/engine/text';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const PUZZLES = 10;
export const TIMERS = { intro: 7, guess: 45, reveal: 6 };
/** First to solve scores the most. */
export const ORDER_POINTS = [1000, 700, 500, 400, 300, 250, 200, 150];

export interface Puzzle {
  emojis: string;
  answer: string; // alternatives separated by "|"
  category: string;
}

export interface EmojiDecodeState extends BaseGameState {
  puzzles: Puzzle[];
  pIndex: number;
  solved: string[];
  feedback: Record<string, { text: string; n: number }>;
  lastPoints: Record<string, number>;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): EmojiDecodeState {
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    puzzles: draw(
      (content['emoji-decode'] ?? []).filter((p) => p.answer),
      PUZZLES,
      rng(seed, 'content'),
    ).map((p) => ({ emojis: p.text, answer: p.answer!, category: p.decoys?.[0] ?? 'Phrase' })),
    pIndex: 0,
    solved: [],
    feedback: {},
    lastPoints: {},
  };
}

const ids = (s: EmojiDecodeState) => s.players.map((p) => p.id);
export const displayAnswer = (p: Puzzle) => p.answer.split('|')[0];

/** Letter blanks for the answer, e.g. "The Lion King" -> "___ ____ ____". */
export function mask(answer: string): string {
  return answer.replace(/[A-Za-z0-9]/g, '_');
}

function start(s: EmojiDecodeState, pIndex: number): EmojiDecodeState {
  if (pIndex >= s.puzzles.length) return goTo(s, 'done', null);
  return goTo(s, 'guess', input(TIMERS.guess), { pIndex, round: pIndex + 1, solved: [], feedback: {}, lastPoints: {} });
}

export function onAction(s: EmojiDecodeState, action: GameAction): EmojiDecodeState {
  if (action.type !== 'SUBMIT' || s.phase !== 'guess') return s;
  const id = action.playerId;
  if (s.solved.includes(id)) return s;
  // Guesses are compared, never shown, so they skip the profanity mask.
  const guess = cleanText({ ...s, settings: { ...s.settings, familyFriendly: false } }, payloadOf(action.payload).guess);
  if (!guess) return s;
  const puzzle = s.puzzles[s.pIndex];
  if (isFuzzyMatch(guess, puzzle.answer)) {
    const points = ORDER_POINTS[Math.min(s.solved.length, ORDER_POINTS.length - 1)];
    return markSubmitted(
      {
        ...s,
        solved: [...s.solved, id],
        scores: { ...s.scores, [id]: s.scores[id] + points },
        lastPoints: { ...s.lastPoints, [id]: points },
        feedback: { ...s.feedback, [id]: { text: 'Correct!', n: (s.feedback[id]?.n ?? 0) + 1 } },
      },
      id,
    );
  }
  return { ...s, feedback: { ...s.feedback, [id]: { text: 'Not quite. Keep guessing!', n: (s.feedback[id]?.n ?? 0) + 1 } } };
}

export function onTimerEnd(s: EmojiDecodeState): EmojiDecodeState {
  switch (s.phase) {
    case 'intro':
      return start(s, 0);
    case 'guess':
      return goTo(s, 'reveal', display(TIMERS.reveal));
    case 'reveal':
      return start(s, s.pIndex + 1);
    default:
      return s;
  }
}

export function isStepComplete(s: EmojiDecodeState): boolean {
  return s.phase === 'guess' && allConnectedSubmitted(s, ids(s));
}

export interface EmojiDecodePublic {
  index: number;
  total: number;
  emojis: string;
  category: string;
  mask: string;
  solved: string[];
  answer: string | null;
  points: Record<string, number>;
}

export function publicView(s: EmojiDecodeState): EmojiDecodePublic | null {
  const p = s.puzzles[s.pIndex];
  if (!p || s.phase === 'intro' || s.phase === 'done') return null;
  return {
    index: s.pIndex,
    total: s.puzzles.length,
    emojis: p.emojis,
    category: p.category,
    mask: mask(displayAnswer(p)),
    solved: s.solved,
    answer: s.phase === 'reveal' ? displayAnswer(p) : null,
    points: s.lastPoints,
  };
}

export function privateView(s: EmojiDecodeState, playerId: string): { solved: boolean; feedback: { text: string; n: number } | null } | null {
  if (s.phase !== 'guess') return null;
  return { solved: s.solved.includes(playerId), feedback: s.feedback[playerId] ?? null };
}

export function audienceVote(): AudienceVote | null {
  return null;
}

export function isOver(s: EmojiDecodeState): boolean {
  return s.phase === 'done';
}
