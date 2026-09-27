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
import { isSmallGroup } from '@/lib/engine/house';
import { draw, pick, rng, shuffle } from '@/lib/engine/rng';
import { clearWinner, tally } from '@/lib/engine/scoring';
import { normalizeAnswer, sameText } from '@/lib/engine/text';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const ROUNDS = 3;
export const GUESS_OPTIONS = 8;
export const CLUE_MAX = 20;
export const TIMERS = { intro: 8, secret: 8, clue: 30, vote: 40, voteReveal: 7, guess: 30, guessReveal: 7 };

export interface ImposterRound {
  category: string;
  word: string;
  decoy: string;
  options: string[];
}

export interface Clue {
  playerId: string;
  text: string;
  passed: boolean;
}

export interface ImposterState extends BaseGameState {
  mode: 'classic' | 'double';
  rounds: ImposterRound[];
  roundIndex: number;
  imposter: string | null;
  pastImposters: string[];
  assignments: Record<string, 'word' | 'decoy'>;
  turnList: string[];
  turn: number;
  clues: Clue[];
  votes: Record<string, string>;
  audienceChoice: string | null;
  accused: string | null;
  imposterGuess: string | null;
  judgements: Record<string, Record<string, boolean>>;
  lastPoints: Record<string, number>;
  errors: Record<string, { text: string; n: number }>;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): ImposterState {
  const rand = rng(seed, 'content');
  const rounds = draw(
    (content.imposter ?? []).filter((x) => x.answer && (x.decoys?.length ?? 0) >= 1),
    ROUNDS,
    rand,
  ).map((x): ImposterRound => {
    const decoys = x.decoys ?? [];
    return {
      category: x.text,
      word: x.answer!,
      decoy: decoys[0],
      options: shuffle([x.answer!, ...shuffle(decoys, rand).slice(0, GUESS_OPTIONS - 1)], rand),
    };
  });
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    mode: isSmallGroup(players.length) ? 'double' : 'classic',
    rounds,
    roundIndex: 0,
    imposter: null,
    pastImposters: [],
    assignments: {},
    turnList: [],
    turn: 0,
    clues: [],
    votes: {},
    audienceChoice: null,
    accused: null,
    imposterGuess: null,
    judgements: {},
    lastPoints: {},
    errors: {},
  };
}

const ids = (s: ImposterState) => s.players.map((p) => p.id);
export const activePlayer = (s: ImposterState) => s.turnList[s.turn];

/** The word a player sees, or null for the classic imposter. */
export function wordFor(s: ImposterState, playerId: string): string | null {
  const round = s.rounds[s.roundIndex];
  if (!round) return null;
  if (s.mode === 'classic') return playerId === s.imposter ? null : round.word;
  return s.assignments[playerId] === 'decoy' ? round.decoy : round.word;
}

function startRound(s: ImposterState, roundIndex: number): ImposterState {
  const base = goTo({ ...s, roundIndex, round: roundIndex + 1 }, 'secret', display(TIMERS.secret));
  const rand = randFor(base, 'roles');
  const order = shuffle(ids(s), rand);
  const passes = s.mode === 'double' || ids(s).length <= 5 ? 2 : 1;
  const turnList = Array.from({ length: passes }, () => order).flat();
  let imposter: string | null = null;
  let assignments: Record<string, 'word' | 'decoy'> = {};
  let pastImposters = s.pastImposters;
  if (s.mode === 'classic') {
    const fresh = ids(s).filter((id) => !s.pastImposters.includes(id));
    imposter = pick(fresh.length ? fresh : ids(s), rand);
    pastImposters = [...s.pastImposters, imposter];
  } else {
    assignments = Object.fromEntries(ids(s).map((id) => [id, rand() < 0.5 ? 'word' : 'decoy']));
  }
  return {
    ...base,
    imposter,
    pastImposters,
    assignments,
    turnList,
    turn: 0,
    clues: [],
    votes: {},
    audienceChoice: null,
    accused: null,
    imposterGuess: null,
    judgements: {},
    lastPoints: {},
    errors: {},
  };
}

function nextTurn(s: ImposterState): ImposterState {
  if (s.turn + 1 < s.turnList.length) return goTo(s, 'clue', input(TIMERS.clue), { turn: s.turn + 1 });
  return goTo(s, s.mode === 'classic' ? 'vote' : 'judge', input(TIMERS.vote));
}

function applyPoints(s: ImposterState, points: Record<string, number>): Pick<ImposterState, 'scores' | 'lastPoints'> {
  const scores = { ...s.scores };
  for (const [id, pts] of Object.entries(points)) if (id in scores) scores[id] += pts;
  return { scores, lastPoints: points };
}

function revealVotes(s: ImposterState): ImposterState {
  if (s.mode === 'double') {
    const points: Record<string, number> = {};
    for (const [judge, calls] of Object.entries(s.judgements)) {
      for (const [target, same] of Object.entries(calls)) {
        const truth = s.assignments[judge] === s.assignments[target];
        if (same === truth) points[judge] = (points[judge] ?? 0) + 500;
      }
    }
    return goTo(s, 'voteReveal', display(TIMERS.voteReveal), applyPoints(s, points));
  }
  const accused = clearWinner(tally(s.votes, s.audienceChoice));
  if (accused && accused === s.imposter) {
    return goTo(s, 'voteReveal', display(TIMERS.voteReveal), { accused, lastPoints: {} });
  }
  return goTo(s, 'voteReveal', display(TIMERS.voteReveal), { accused, ...applyPoints(s, { [s.imposter!]: 1000 }) });
}

function revealGuess(s: ImposterState): ImposterState {
  const round = s.rounds[s.roundIndex];
  const right = s.imposterGuess != null && sameText(s.imposterGuess, round.word);
  const points: Record<string, number> = right
    ? { [s.imposter!]: 1000 }
    : Object.fromEntries(ids(s).filter((id) => id !== s.imposter).map((id) => [id, 500]));
  return goTo(s, 'guessReveal', display(TIMERS.guessReveal), applyPoints(s, points));
}

function afterRound(s: ImposterState): ImposterState {
  return s.roundIndex + 1 < s.rounds.length ? startRound(s, s.roundIndex + 1) : goTo(s, 'done', null);
}

function rejectClue(s: ImposterState, id: string, text: string): ImposterState {
  return { ...s, errors: { ...s.errors, [id]: { text, n: (s.errors[id]?.n ?? 0) + 1 } } };
}

export function onAction(s: ImposterState, action: GameAction): ImposterState {
  if (action.type === 'AUDIENCE_VOTE') {
    return s.phase === 'vote' && ids(s).includes(action.choiceId) ? { ...s, audienceChoice: action.choiceId } : s;
  }
  const id = action.playerId;
  if (s.submitted.includes(id)) return s;

  if (action.type === 'SUBMIT' && s.phase === 'clue' && id === activePlayer(s)) {
    const text = cleanText(s, payloadOf(action.payload).text, CLUE_MAX);
    if (!text) return s;
    if (/\s/.test(text)) return rejectClue(s, id, 'One word only!');
    const mine = wordFor(s, id);
    // Only check players who know a word: rejecting the imposter would leak the answer.
    if (mine) {
      const clue = normalizeAnswer(text).replace(/ /g, '');
      const word = normalizeAnswer(mine).replace(/ /g, '');
      if (clue.includes(word) || (clue.length >= 3 && word.includes(clue))) return rejectClue(s, id, "Too close to your word! Try another clue.");
    }
    const next = markSubmitted({ ...s, clues: [...s.clues, { playerId: id, text, passed: false }] }, id);
    return nextTurn(next);
  }

  if (action.type === 'VOTE' && s.phase === 'vote') {
    if (action.choiceId === id || !ids(s).includes(action.choiceId)) return s;
    return markSubmitted({ ...s, votes: { ...s.votes, [id]: action.choiceId } }, id);
  }

  if (action.type === 'SUBMIT' && s.phase === 'judge') {
    const raw = payloadOf(payloadOf(action.payload).calls);
    const others = ids(s).filter((x) => x !== id);
    if (!others.every((x) => typeof raw[x] === 'boolean')) return s;
    return markSubmitted({ ...s, judgements: { ...s.judgements, [id]: Object.fromEntries(others.map((x) => [x, raw[x] as boolean])) } }, id);
  }

  if (action.type === 'SUBMIT' && s.phase === 'guess' && id === s.imposter) {
    const guess = payloadOf(action.payload).word;
    const round = s.rounds[s.roundIndex];
    if (typeof guess !== 'string' || !round.options.includes(guess)) return s;
    return markSubmitted({ ...s, imposterGuess: guess }, id);
  }
  return s;
}

export function onTimerEnd(s: ImposterState): ImposterState {
  switch (s.phase) {
    case 'intro':
      return s.rounds.length ? startRound(s, 0) : goTo(s, 'done', null);
    case 'secret':
      return goTo(s, 'clue', input(TIMERS.clue), { turn: 0 });
    case 'clue': {
      const active = activePlayer(s);
      const answered = s.clues.length > s.turn;
      const next = answered ? s : { ...s, clues: [...s.clues, { playerId: active, text: '', passed: true }] };
      return nextTurn(next);
    }
    case 'vote':
    case 'judge':
      return revealVotes(s);
    case 'voteReveal':
      if (s.mode === 'classic' && s.accused && s.accused === s.imposter) return goTo(s, 'guess', input(TIMERS.guess));
      return afterRound(s);
    case 'guess':
      return revealGuess(s);
    case 'guessReveal':
      return afterRound(s);
    default:
      return s;
  }
}

export function isStepComplete(s: ImposterState): boolean {
  if (s.phase === 'clue') return allConnectedSubmitted(s, [activePlayer(s)]);
  if (s.phase === 'vote' || s.phase === 'judge') return allConnectedSubmitted(s, ids(s));
  if (s.phase === 'guess') return allConnectedSubmitted(s, s.imposter ? [s.imposter] : []);
  return false;
}

export interface ImposterPublic {
  mode: 'classic' | 'double';
  roundIndex: number;
  totalRounds: number;
  category: string;
  clues: Clue[];
  activeId: string | null;
  turn: number;
  turns: number;
  options: string[] | null;
  imposterId: string | null;
  reveal: {
    votes: Record<string, string>;
    audience: string | null;
    accused: string | null;
    imposterId: string | null;
    word: string;
    decoy: string | null;
    assignments: Record<string, 'word' | 'decoy'> | null;
    judgements: Record<string, Record<string, boolean>> | null;
    guess: string | null;
    points: Record<string, number>;
  } | null;
}

export function publicView(s: ImposterState): ImposterPublic | null {
  const round = s.rounds[s.roundIndex];
  if (!round || s.phase === 'intro' || s.phase === 'done') return null;
  const caught = s.phase === 'guess' || s.phase === 'guessReveal';
  const revealed = s.phase === 'guessReveal' || (s.phase === 'voteReveal' && !(s.mode === 'classic' && s.accused === s.imposter));
  return {
    mode: s.mode,
    roundIndex: s.roundIndex,
    totalRounds: s.rounds.length,
    category: round.category,
    clues: s.clues,
    activeId: s.phase === 'clue' ? activePlayer(s) : null,
    turn: s.turn,
    turns: s.turnList.length,
    options: caught ? round.options : null,
    imposterId: caught ? s.imposter : null,
    reveal:
      s.phase === 'voteReveal' || s.phase === 'guessReveal'
        ? {
            votes: s.votes,
            audience: s.audienceChoice,
            accused: s.accused,
            imposterId: s.mode === 'classic' ? s.imposter : null,
            // The word stays hidden while a caught imposter still gets to guess it.
            word: revealed ? round.word : '',
            decoy: s.mode === 'double' && revealed ? round.decoy : null,
            assignments: s.mode === 'double' ? s.assignments : null,
            judgements: s.mode === 'double' ? s.judgements : null,
            guess: s.phase === 'guessReveal' ? s.imposterGuess : null,
            points: s.lastPoints,
          }
        : null,
  };
}

export type ImposterPrivate =
  | { kind: 'role'; word: string | null; imposter: boolean; active: boolean; error: { text: string; n: number } | null }
  | { kind: 'guess'; imposter: boolean; options: string[] };

export function privateView(s: ImposterState, playerId: string): ImposterPrivate | null {
  const round = s.rounds[s.roundIndex];
  if (!round) return null;
  if (['secret', 'clue', 'vote', 'judge'].includes(s.phase)) {
    const word = wordFor(s, playerId);
    return {
      kind: 'role',
      word,
      imposter: s.mode === 'classic' && playerId === s.imposter,
      active: s.phase === 'clue' && activePlayer(s) === playerId,
      error: s.errors[playerId] ?? null,
    };
  }
  if (s.phase === 'guess') return { kind: 'guess', imposter: playerId === s.imposter, options: round.options };
  return null;
}

export function audienceVote(s: ImposterState): AudienceVote | null {
  if (s.phase !== 'vote') return null;
  return { prompt: 'Who is the imposter?', options: s.players.map((p) => ({ id: p.id, label: p.name })) };
}

export function isOver(s: ImposterState): boolean {
  return s.phase === 'done';
}
