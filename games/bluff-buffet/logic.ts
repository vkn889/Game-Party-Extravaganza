import {
  allConnectedSubmitted,
  cleanText,
  createBase,
  display,
  goTo,
  input,
  markSubmitted,
  payloadOf,
  randFor,
} from '@/lib/engine/base';
import { HOUSE_ID, houseFill } from '@/lib/engine/house';
import { draw, rng, shuffle } from '@/lib/engine/rng';
import { isFuzzyMatch, sameText } from '@/lib/engine/text';
import type { AudienceVote, BaseGameState, ContentItem, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const TIMERS = { intro: 8, lie: 45, pick: 25, reveal: 8 };
/** Round 1: 3 facts at x1, round 2: 3 facts at x2, final: 1 fact at x3. */
export const MULTIPLIERS = [1, 1, 1, 2, 2, 2, 3];
export const MIN_OPTIONS = 4;
export const LIE_MAX = 40;
const GENERIC_LIES = ['a rubber duck', 'Belgium', 'forty-two', 'a very old goat'];

export interface BluffOption {
  id: string;
  text: string;
  kind: 'truth' | 'lie' | 'house';
  authors: string[];
}

export interface BluffBuffetState extends BaseGameState {
  facts: ContentItem[];
  qIndex: number;
  lies: Record<string, string>;
  options: BluffOption[];
  picks: Record<string, string>;
  audienceChoice: string | null;
  lastPoints: Record<string, number>;
  errors: Record<string, { text: string; n: number }>;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): BluffBuffetState {
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    facts: draw(
      (content['bluff-buffet'] ?? []).filter((f) => f.answer),
      MULTIPLIERS.length,
      rng(seed, 'content'),
    ),
    qIndex: 0,
    lies: {},
    options: [],
    picks: {},
    audienceChoice: null,
    lastPoints: {},
    errors: {},
  };
}

const ids = (s: BluffBuffetState) => s.players.map((p) => p.id);
export const multiplier = (qIndex: number) => MULTIPLIERS[Math.min(qIndex, MULTIPLIERS.length - 1)];

function startFact(s: BluffBuffetState, qIndex: number): BluffBuffetState {
  if (qIndex >= s.facts.length) return goTo(s, 'done', null);
  return goTo(s, 'lie', input(TIMERS.lie), {
    qIndex,
    round: multiplier(qIndex),
    lies: {},
    options: [],
    picks: {},
    audienceChoice: null,
    lastPoints: {},
    errors: {},
  });
}

function startPick(s: BluffBuffetState): BluffBuffetState {
  const fact = s.facts[s.qIndex];
  const rand = randFor(s, 'options');
  const merged: { text: string; authors: string[] }[] = [];
  for (const [author, text] of Object.entries(s.lies)) {
    const same = merged.find((m) => sameText(m.text, text));
    if (same) same.authors.push(author);
    else merged.push({ text, authors: [author] });
  }
  const existing = [fact.answer!, ...merged.map((m) => m.text)];
  // House lies fill the list to at least 4 options (PRD §3).
  let house = houseFill(existing, MIN_OPTIONS, fact.decoys ?? [], rand);
  if (existing.length + house.length < MIN_OPTIONS) house = [...house, ...houseFill([...existing, ...house], MIN_OPTIONS, GENERIC_LIES, rand)];
  const options = shuffle(
    [
      { text: fact.answer!, kind: 'truth' as const, authors: [] as string[] },
      ...merged.map((m) => ({ ...m, kind: 'lie' as const })),
      ...house.map((text) => ({ text, kind: 'house' as const, authors: [HOUSE_ID] })),
    ],
    rand,
  ).map((o, i) => ({ ...o, id: `o${i}` }));
  return goTo(s, 'pick', input(TIMERS.pick), { options });
}

function reveal(s: BluffBuffetState): BluffBuffetState {
  const mult = multiplier(s.qIndex);
  const points: Record<string, number> = {};
  const add = (id: string, pts: number) => {
    if (id !== HOUSE_ID) points[id] = (points[id] ?? 0) + pts;
  };
  for (const [picker, optionId] of Object.entries(s.picks)) {
    const option = s.options.find((o) => o.id === optionId);
    if (option?.kind === 'truth') add(picker, 1000 * mult);
    else if (option?.kind === 'lie') for (const a of option.authors) add(a, 500 * mult);
  }
  const scores = { ...s.scores };
  for (const [id, pts] of Object.entries(points)) if (id in scores) scores[id] += pts;
  return goTo(s, 'reveal', display(TIMERS.reveal), { scores, lastPoints: points });
}

export function onAction(s: BluffBuffetState, action: GameAction): BluffBuffetState {
  if (action.type === 'AUDIENCE_VOTE') {
    return s.phase === 'pick' && s.options.some((o) => o.id === action.choiceId) ? { ...s, audienceChoice: action.choiceId } : s;
  }
  const id = action.playerId;
  if (s.submitted.includes(id)) return s;
  if (action.type === 'SUBMIT' && s.phase === 'lie') {
    const text = cleanText(s, payloadOf(action.payload).text, LIE_MAX);
    if (!text) return s;
    const truth = s.facts[s.qIndex].answer!;
    if (sameText(text, truth) || isFuzzyMatch(text, truth)) {
      return { ...s, errors: { ...s.errors, [id]: { text: "That's the truth! Write a lie instead.", n: (s.errors[id]?.n ?? 0) + 1 } } };
    }
    return markSubmitted({ ...s, lies: { ...s.lies, [id]: text } }, id);
  }
  if (action.type === 'VOTE' && s.phase === 'pick') {
    const option = s.options.find((o) => o.id === action.choiceId);
    if (!option || option.authors.includes(id)) return s;
    return markSubmitted({ ...s, picks: { ...s.picks, [id]: option.id } }, id);
  }
  return s;
}

export function onTimerEnd(s: BluffBuffetState): BluffBuffetState {
  switch (s.phase) {
    case 'intro':
      return startFact(s, 0);
    case 'lie':
      return startPick(s);
    case 'pick':
      return reveal(s);
    case 'reveal':
      return startFact(s, s.qIndex + 1);
    default:
      return s;
  }
}

export function isStepComplete(s: BluffBuffetState): boolean {
  return (s.phase === 'lie' || s.phase === 'pick') && allConnectedSubmitted(s, ids(s));
}

export interface BluffBuffetPublic {
  index: number;
  total: number;
  multiplier: number;
  fact: string;
  options: { id: string; text: string }[] | null;
  reveal: { options: BluffOption[]; picks: Record<string, string>; audience: string | null; points: Record<string, number> } | null;
}

export function publicView(s: BluffBuffetState): BluffBuffetPublic | null {
  const fact = s.facts[s.qIndex];
  if (!fact || s.phase === 'intro' || s.phase === 'done') return null;
  return {
    index: s.qIndex,
    total: s.facts.length,
    multiplier: multiplier(s.qIndex),
    fact: fact.text,
    options: s.phase === 'pick' || s.phase === 'reveal' ? s.options.map((o) => ({ id: o.id, text: o.text })) : null,
    reveal: s.phase === 'reveal' ? { options: s.options, picks: s.picks, audience: s.audienceChoice, points: s.lastPoints } : null,
  };
}

export type BluffBuffetPrivate =
  | { kind: 'lie'; done: boolean; error: { text: string; n: number } | null }
  | { kind: 'pick'; ownOptionIds: string[]; picked: string | null };

export function privateView(s: BluffBuffetState, playerId: string): BluffBuffetPrivate | null {
  if (s.phase === 'lie') return { kind: 'lie', done: s.submitted.includes(playerId), error: s.errors[playerId] ?? null };
  if (s.phase === 'pick')
    return { kind: 'pick', ownOptionIds: s.options.filter((o) => o.authors.includes(playerId)).map((o) => o.id), picked: s.picks[playerId] ?? null };
  return null;
}

export function audienceVote(s: BluffBuffetState): AudienceVote | null {
  if (s.phase !== 'pick') return null;
  return { prompt: s.facts[s.qIndex].text, options: s.options.map((o) => ({ id: o.id, label: o.text })) };
}

export function isOver(s: BluffBuffetState): boolean {
  return s.phase === 'done';
}
