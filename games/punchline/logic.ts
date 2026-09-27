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
import { HOUSE_ID, isSmallGroup } from '@/lib/engine/house';
import { draw, pick, rng, shuffle } from '@/lib/engine/rng';
import { tally } from '@/lib/engine/scoring';
import { sameText } from '@/lib/engine/text';
import type { AudienceVote, BaseGameState, ContentItem, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const ROUNDS = 3;
export const TIMERS = { intro: 6, answer: 80, finalAnswer: 70, vote: 20, reveal: 7, scores: 6 };
const GENERIC_HOUSE = ['A suspiciously large spoon', 'Grandma, but faster', 'Three raccoons in a coat', 'Interpretive dance'];

export interface PAnswer {
  id: string;
  authorId: string; // a player id or HOUSE_ID
  text: string;
  missing: boolean;
}

export interface PMatchup {
  id: string;
  prompt: string;
  houseAnswers: string[];
  playerIds: string[]; // who answers this prompt
  answers: PAnswer[];
  votes: Record<string, string>; // voter -> answer id
  audienceChoice: string | null;
  points: Record<string, number> | null; // answer id -> points, set at reveal
}

export interface PunchlineState extends BaseGameState {
  mode: 'duel' | 'house';
  prompts: ContentItem[];
  cursor: number;
  matchups: PMatchup[];
  current: number;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): PunchlineState {
  const base = createBase(players, settings, seed);
  const mode = isSmallGroup(players.length) ? 'house' : 'duel';
  const needed = mode === 'duel' ? players.length * 2 + 1 : 5;
  return {
    ...base,
    timer: display(TIMERS.intro),
    mode,
    prompts: draw(content.punchline ?? [], needed, rng(seed, 'prompts')),
    cursor: 0,
    matchups: [],
    current: 0,
  };
}

const isFinal = (s: PunchlineState) => s.round === ROUNDS;

function nextPrompt(s: PunchlineState, cursor: number): { item: ContentItem; cursor: number } {
  const item = s.prompts[cursor % Math.max(1, s.prompts.length)] ?? { text: 'The best thing about parties: ___' };
  return { item, cursor: cursor + 1 };
}

function setupRound(s: PunchlineState, round: number): PunchlineState {
  const next = { ...s, round };
  const rand = randFor(next, 'round', round);
  const ids = shuffle(
    s.players.map((p) => p.id),
    rand,
  );
  let cursor = s.cursor;
  const groups: string[][] = [];
  if (round === ROUNDS) groups.push(ids);
  else if (s.mode === 'duel') ids.forEach((id, i) => groups.push([id, ids[(i + 1) % ids.length]]));
  else groups.push(ids, ids);

  const matchups: PMatchup[] = groups.map((playerIds, i) => {
    const taken = nextPrompt(s, cursor);
    cursor = taken.cursor;
    return {
      id: `r${round}m${i}`,
      prompt: taken.item.text,
      houseAnswers: taken.item.decoys?.length ? taken.item.decoys : GENERIC_HOUSE,
      playerIds,
      answers: [],
      votes: {},
      audienceChoice: null,
      points: null,
    };
  });
  return goTo(next, 'answer', input(round === ROUNDS ? TIMERS.finalAnswer : TIMERS.answer), {
    matchups,
    cursor,
    current: 0,
  });
}

function assignedTo(s: PunchlineState, playerId: string): PMatchup[] {
  return s.matchups.filter((m) => m.playerIds.includes(playerId));
}

/** Who may vote on a matchup: outsiders in a duel, everyone otherwise (never for their own answer). */
export function eligibleVoters(s: PunchlineState, m: PMatchup): string[] {
  const ids = s.players.map((p) => p.id);
  if (s.mode === 'duel' && !isFinal(s)) return ids.filter((id) => !m.playerIds.includes(id));
  return ids;
}

function presentAnswers(m: PMatchup): PAnswer[] {
  return m.answers.filter((a) => !a.missing);
}

/** Prepares a matchup for voting: House answer, shuffle, anonymous ids. */
function startMatchup(s: PunchlineState, index: number): PunchlineState {
  const m = s.matchups[index];
  const rand = randFor(s, 'vote', index);
  let answers = m.answers.slice();
  if (s.mode === 'house') {
    const existing = answers.filter((a) => !a.missing).map((a) => a.text);
    const house = shuffle(m.houseAnswers, rand).find((h) => !existing.some((e) => sameText(e, h))) ?? pick(GENERIC_HOUSE, rand);
    answers.push({ id: '', authorId: HOUSE_ID, text: house, missing: false });
  }
  answers = shuffle(answers, rand).map((a, i) => ({ ...a, id: String.fromCharCode(97 + i) }));
  const matchups = s.matchups.map((x, i) => (i === index ? { ...x, answers } : x));
  const next = { ...s, matchups, current: index };
  const playerAnswers = answers.filter((a) => !a.missing && a.authorId !== HOUSE_ID);
  // Forfeits (nobody or only one person answered) skip straight to the reveal.
  if (playerAnswers.length === 0 || presentAnswers({ ...m, answers }).length < 2) return reveal(next);
  return goTo(next, 'vote', input(TIMERS.vote));
}

function reveal(s: PunchlineState): PunchlineState {
  const m = s.matchups[s.current];
  const mult = s.round;
  const counts = tally(m.votes, m.audienceChoice);
  const points: Record<string, number> = {};
  const present = presentAnswers(m);
  const total = present.reduce((sum, a) => sum + (counts[a.id] ?? 0), 0);

  if (s.mode === 'duel' && !isFinal(s)) {
    if (present.length === 1) {
      points[present[0].id] = 500 * mult; // win by forfeit
    } else if (total > 0) {
      for (const a of present) points[a.id] = Math.round((1000 * mult * (counts[a.id] ?? 0)) / total);
      const sweep = present.find((a) => counts[a.id] === total);
      if (sweep && total >= 2) points[sweep.id] += 250 * mult;
    }
  } else if (s.mode === 'duel') {
    for (const a of present) points[a.id] = (counts[a.id] ?? 0) * 300 * mult;
  } else {
    const house = m.answers.find((a) => a.authorId === HOUSE_ID);
    const houseVotes = house ? (counts[house.id] ?? 0) : 0;
    for (const a of present) {
      if (a.authorId === HOUSE_ID) continue;
      const votes = counts[a.id] ?? 0;
      points[a.id] = votes * 500 * mult + (votes > houseVotes ? 250 * mult : 0);
    }
  }

  const scores = { ...s.scores };
  for (const a of m.answers) {
    if (points[a.id] && a.authorId in scores) scores[a.authorId] += points[a.id];
  }
  const matchups = s.matchups.map((x, i) => (i === s.current ? { ...x, points } : x));
  return goTo(s, 'reveal', display(TIMERS.reveal), { matchups, scores });
}

export function onAction(s: PunchlineState, action: GameAction): PunchlineState {
  if (action.type === 'AUDIENCE_VOTE') {
    if (s.phase !== 'vote') return s;
    const m = s.matchups[s.current];
    if (!m.answers.some((a) => a.id === action.choiceId && !a.missing)) return s;
    return { ...s, matchups: s.matchups.map((x, i) => (i === s.current ? { ...x, audienceChoice: action.choiceId } : x)) };
  }

  if (action.type === 'SUBMIT' && s.phase === 'answer') {
    const { matchupId, text } = payloadOf(action.payload);
    const m = s.matchups.find((x) => x.id === matchupId);
    if (!m || !m.playerIds.includes(action.playerId)) return s;
    if (m.answers.some((a) => a.authorId === action.playerId)) return s;
    const clean = cleanText(s, text);
    if (!clean) return s;
    const answer: PAnswer = { id: action.playerId, authorId: action.playerId, text: clean, missing: false };
    let next: PunchlineState = {
      ...s,
      matchups: s.matchups.map((x) => (x.id === m.id ? { ...x, answers: [...x.answers, answer] } : x)),
    };
    const done = assignedTo(next, action.playerId).every((x) => x.answers.some((a) => a.authorId === action.playerId));
    if (done) next = markSubmitted(next, action.playerId);
    return next;
  }

  if (action.type === 'VOTE' && s.phase === 'vote') {
    const m = s.matchups[s.current];
    if (!eligibleVoters(s, m).includes(action.playerId) || m.votes[action.playerId]) return s;
    const choice = m.answers.find((a) => a.id === action.choiceId);
    if (!choice || choice.missing || choice.authorId === action.playerId) return s;
    const next = {
      ...s,
      matchups: s.matchups.map((x, i) => (i === s.current ? { ...x, votes: { ...x.votes, [action.playerId]: choice.id } } : x)),
    };
    return markSubmitted(next, action.playerId);
  }
  return s;
}

export function onTimerEnd(s: PunchlineState): PunchlineState {
  switch (s.phase) {
    case 'intro':
      return setupRound(s, 1);
    case 'answer': {
      // Anyone who ran out of time gets a blank answer, which simply can't win.
      const matchups = s.matchups.map((m) => {
        const missing = m.playerIds
          .filter((id) => !m.answers.some((a) => a.authorId === id))
          .map((id): PAnswer => ({ id, authorId: id, text: '', missing: true }));
        return { ...m, answers: [...m.answers, ...missing] };
      });
      return startMatchup({ ...s, matchups }, 0);
    }
    case 'vote':
      return reveal(s);
    case 'reveal':
      if (s.current + 1 < s.matchups.length) return startMatchup(s, s.current + 1);
      if (s.round < ROUNDS) return goTo(s, 'scores', display(TIMERS.scores));
      return goTo(s, 'done', null);
    case 'scores':
      return setupRound(s, s.round + 1);
    default:
      return s;
  }
}

export function isStepComplete(s: PunchlineState): boolean {
  if (s.phase === 'answer') return allConnectedSubmitted(s, s.players.map((p) => p.id));
  if (s.phase === 'vote') return allConnectedSubmitted(s, eligibleVoters(s, s.matchups[s.current]));
  return false;
}

export interface PunchlinePublic {
  mode: 'duel' | 'house';
  final: boolean;
  round: number;
  matchupIndex: number;
  matchupCount: number;
  matchup: {
    prompt: string;
    answerers: string[];
    options: { id: string; text: string; missing: boolean }[];
    reveal: {
      authors: Record<string, string>;
      votes: Record<string, string[]>;
      audience: string | null;
      points: Record<string, number>;
    } | null;
  } | null;
}

export function publicView(s: PunchlineState): PunchlinePublic {
  const m = s.matchups[s.current];
  const showMatchup = (s.phase === 'vote' || s.phase === 'reveal') && m;
  return {
    mode: s.mode,
    final: isFinal(s),
    round: s.round,
    matchupIndex: s.current,
    matchupCount: s.matchups.length,
    matchup: showMatchup
      ? {
          prompt: m.prompt,
          answerers: s.mode === 'duel' && !isFinal(s) ? m.playerIds : [],
          options: m.answers.map((a) => ({ id: a.id, text: a.text, missing: a.missing })),
          reveal:
            s.phase === 'reveal'
              ? {
                  authors: Object.fromEntries(m.answers.map((a) => [a.id, a.authorId])),
                  votes: Object.fromEntries(
                    m.answers.map((a) => [a.id, Object.keys(m.votes).filter((v) => m.votes[v] === a.id)]),
                  ),
                  audience: m.audienceChoice,
                  points: m.points ?? {},
                }
              : null,
        }
      : null,
  };
}

export type PunchlinePrivate =
  | { kind: 'answer'; tasks: { matchupId: string; prompt: string; answered: boolean }[] }
  | { kind: 'vote'; canVote: boolean; ownAnswerId: string | null; votedFor: string | null };

export function privateView(s: PunchlineState, playerId: string): PunchlinePrivate | null {
  if (s.phase === 'answer') {
    return {
      kind: 'answer',
      tasks: assignedTo(s, playerId).map((m) => ({
        matchupId: m.id,
        prompt: m.prompt,
        answered: m.answers.some((a) => a.authorId === playerId),
      })),
    };
  }
  if (s.phase === 'vote') {
    const m = s.matchups[s.current];
    return {
      kind: 'vote',
      canVote: eligibleVoters(s, m).includes(playerId),
      ownAnswerId: m.answers.find((a) => a.authorId === playerId)?.id ?? null,
      votedFor: m.votes[playerId] ?? null,
    };
  }
  return null;
}

export function audienceVote(s: PunchlineState): AudienceVote | null {
  if (s.phase !== 'vote') return null;
  const m = s.matchups[s.current];
  return {
    prompt: m.prompt,
    options: m.answers.filter((a) => !a.missing).map((a) => ({ id: a.id, label: a.text })),
  };
}

export function isOver(s: PunchlineState): boolean {
  return s.phase === 'done';
}
