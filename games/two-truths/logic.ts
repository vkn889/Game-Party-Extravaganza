import { allConnectedSubmitted, cleanText, createBase, display, goTo, input, markSubmitted, payloadOf, randFor } from '@/lib/engine/base';
import { draw, rng, shuffle } from '@/lib/engine/rng';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const TIMERS = { intro: 8, write: 150, guess: 30, reveal: 7 };

export interface Statements {
  truths: [string, string];
  lie: string;
}

export interface TwoTruthsState extends BaseGameState {
  ideas: string[];
  statements: Record<string, Statements>;
  queue: string[];
  current: number;
  options: { id: string; text: string; isLie: boolean }[];
  guesses: Record<string, string>;
  audienceChoice: string | null;
  lastPoints: Record<string, number>;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): TwoTruthsState {
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    ideas: draw(content['two-truths'] ?? [], 3, rng(seed, 'ideas')).map((x) => x.text),
    statements: {},
    queue: [],
    current: 0,
    options: [],
    guesses: {},
    audienceChoice: null,
    lastPoints: {},
  };
}

const ids = (s: TwoTruthsState) => s.players.map((p) => p.id);
export const authorOf = (s: TwoTruthsState) => s.queue[s.current];
const guessers = (s: TwoTruthsState) => ids(s).filter((id) => id !== authorOf(s));

function startGuess(s: TwoTruthsState, current: number): TwoTruthsState {
  const author = s.queue[current];
  if (!author) return goTo(s, 'done', null);
  const st = s.statements[author];
  const next = { ...s, current, round: current + 1 };
  const options = shuffle(
    [
      { text: st.truths[0], isLie: false },
      { text: st.truths[1], isLie: false },
      { text: st.lie, isLie: true },
    ],
    randFor(next, 'shuffle'),
  ).map((o, i) => ({ ...o, id: `s${i}` }));
  return goTo(next, 'guess', input(TIMERS.guess), { options, guesses: {}, audienceChoice: null, lastPoints: {} });
}

function reveal(s: TwoTruthsState): TwoTruthsState {
  const author = authorOf(s);
  const lie = s.options.find((o) => o.isLie)!;
  const points: Record<string, number> = {};
  for (const [guesser, choice] of Object.entries(s.guesses)) {
    if (choice === lie.id) points[guesser] = (points[guesser] ?? 0) + 500;
    else points[author] = (points[author] ?? 0) + 300;
  }
  const scores = { ...s.scores };
  for (const [id, pts] of Object.entries(points)) scores[id] += pts;
  return goTo(s, 'reveal', display(TIMERS.reveal), { scores, lastPoints: points });
}

export function onAction(s: TwoTruthsState, action: GameAction): TwoTruthsState {
  if (action.type === 'AUDIENCE_VOTE') {
    return s.phase === 'guess' && s.options.some((o) => o.id === action.choiceId) ? { ...s, audienceChoice: action.choiceId } : s;
  }
  const id = action.playerId;
  if (s.submitted.includes(id)) return s;
  if (action.type === 'SUBMIT' && s.phase === 'write') {
    const p = payloadOf(action.payload);
    const truths = Array.isArray(p.truths) ? p.truths.map((t) => cleanText(s, t)) : [];
    const lie = cleanText(s, p.lie);
    if (truths.length !== 2 || truths.some((t) => !t) || !lie) return s;
    return markSubmitted({ ...s, statements: { ...s.statements, [id]: { truths: [truths[0], truths[1]], lie } } }, id);
  }
  if (action.type === 'VOTE' && s.phase === 'guess' && id !== authorOf(s)) {
    if (!s.options.some((o) => o.id === action.choiceId)) return s;
    return markSubmitted({ ...s, guesses: { ...s.guesses, [id]: action.choiceId } }, id);
  }
  return s;
}

export function onTimerEnd(s: TwoTruthsState): TwoTruthsState {
  switch (s.phase) {
    case 'intro':
      return goTo(s, 'write', input(TIMERS.write));
    case 'write': {
      // Only players who wrote their statements get a turn in the spotlight.
      const queue = shuffle(
        ids(s).filter((id) => s.statements[id]),
        randFor(s, 'queue'),
      );
      return startGuess({ ...s, queue }, 0);
    }
    case 'guess':
      return reveal(s);
    case 'reveal':
      return startGuess(s, s.current + 1);
    default:
      return s;
  }
}

export function isStepComplete(s: TwoTruthsState): boolean {
  if (s.phase === 'write') return allConnectedSubmitted(s, ids(s));
  if (s.phase === 'guess') return allConnectedSubmitted(s, guessers(s));
  return false;
}

export interface TwoTruthsPublic {
  index: number;
  total: number;
  authorId: string;
  options: { id: string; text: string }[];
  reveal: { lieId: string; guesses: Record<string, string>; audience: string | null; points: Record<string, number> } | null;
}

export function publicView(s: TwoTruthsState): TwoTruthsPublic | null {
  if (s.phase !== 'guess' && s.phase !== 'reveal') return null;
  return {
    index: s.current,
    total: s.queue.length,
    authorId: authorOf(s),
    options: s.options.map((o) => ({ id: o.id, text: o.text })),
    reveal:
      s.phase === 'reveal'
        ? { lieId: s.options.find((o) => o.isLie)!.id, guesses: s.guesses, audience: s.audienceChoice, points: s.lastPoints }
        : null,
  };
}

export type TwoTruthsPrivate = { kind: 'write'; done: boolean; ideas: string[] } | { kind: 'guess'; author: boolean; guessed: string | null };

export function privateView(s: TwoTruthsState, playerId: string): TwoTruthsPrivate | null {
  if (s.phase === 'write') return { kind: 'write', done: s.submitted.includes(playerId), ideas: s.ideas };
  if (s.phase === 'guess') return { kind: 'guess', author: authorOf(s) === playerId, guessed: s.guesses[playerId] ?? null };
  return null;
}

export function audienceVote(s: TwoTruthsState): AudienceVote | null {
  if (s.phase !== 'guess') return null;
  return { prompt: 'Which one is the lie?', options: s.options.map((o) => ({ id: o.id, label: o.text })) };
}

export function isOver(s: TwoTruthsState): boolean {
  return s.phase === 'done';
}
