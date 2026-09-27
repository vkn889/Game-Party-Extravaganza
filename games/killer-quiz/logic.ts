import {
  allConnectedSubmitted,
  createBase,
  display,
  goTo,
  input,
  markSubmitted,
  payloadOf,
  randFor,
} from '@/lib/engine/base';
import { draw, randInt, rng, shuffle } from '@/lib/engine/rng';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const QUESTIONS = 8;
export const FINISH = 8;
export const ALIVE_START = 2;
export const MAX_FINALE = 10;
export const SYMBOLS = ['★', '●', '▲', '■', '♥', '◆'];
export const MINIGAMES = ['dice', 'memory', 'math'] as const;
export const TIMERS = {
  intro: 7,
  question: 20,
  questionReveal: 6,
  deathIntro: 5,
  dice: 15,
  memoryShow: 5,
  memoryInput: 15,
  math: 25,
  deathReveal: 6,
  finaleIntro: 8,
  finale: 20,
  finaleReveal: 6,
};

export type MinigameKind = (typeof MINIGAMES)[number];

export type Minigame =
  | { kind: 'dice'; picks: Record<string, number[]>; roll: number | null }
  | { kind: 'memory'; sequence: number[]; guesses: Record<string, number[]> }
  | { kind: 'math'; problems: { text: string; answer: number }[]; answers: Record<string, number[]> };

export interface Question {
  text: string;
  options: string[];
  correct: number;
}

export interface FinaleItem {
  text: string;
  options: { label: string; correct: boolean }[];
}

export interface KillerQuizState extends BaseGameState {
  questions: Question[];
  qIndex: number;
  answers: Record<string, number>;
  results: Record<string, boolean | null>; // last question: right / wrong / sat out
  alive: Record<string, boolean>;
  atRisk: string[];
  deaths: number; // minigames played, rotates the kind
  minigame: Minigame | null;
  died: string[];
  finale: FinaleItem[];
  finaleIndex: number;
  positions: Record<string, number>;
  finalePicks: Record<string, number[]>;
  lastMoves: Record<string, number>;
  exited: string[];
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): KillerQuizState {
  const rand = rng(seed, 'content');
  const questions = draw(content['killer-quiz'] ?? [], QUESTIONS, rand).map((item): Question => {
    const options = shuffle([item.answer ?? '', ...(item.decoys ?? []).slice(0, 3)], rand);
    return { text: item.text, options, correct: options.indexOf(item.answer ?? '') };
  });
  const finale = draw(content['killer-quiz-finale'] ?? [], MAX_FINALE, rand).map((item): FinaleItem => {
    const right = (item.answer ?? '').split('|').filter(Boolean);
    const wrong = shuffle(item.decoys ?? [], rand).slice(0, Math.max(1, 4 - right.length));
    return {
      text: item.text,
      options: shuffle([...right.map((label) => ({ label, correct: true })), ...wrong.map((label) => ({ label, correct: false }))], rand),
    };
  });
  const base = createBase(players, settings, seed);
  return {
    ...base,
    timer: display(TIMERS.intro),
    questions,
    qIndex: 0,
    answers: {},
    results: {},
    alive: Object.fromEntries(players.map((p) => [p.id, true])),
    atRisk: [],
    deaths: 0,
    minigame: null,
    died: [],
    finale,
    finaleIndex: 0,
    positions: {},
    finalePicks: {},
    lastMoves: {},
    exited: [],
  };
}

const ids = (s: KillerQuizState) => s.players.map((p) => p.id);

function startQuestion(s: KillerQuizState, qIndex: number): KillerQuizState {
  return goTo(s, 'question', input(TIMERS.question), { qIndex, answers: {}, results: {}, atRisk: [], died: [], round: qIndex + 1 });
}

function revealQuestion(s: KillerQuizState): KillerQuizState {
  const q = s.questions[s.qIndex];
  const scores = { ...s.scores };
  const results: Record<string, boolean | null> = {};
  const atRisk: string[] = [];
  for (const id of ids(s)) {
    const answer = s.answers[id];
    if (answer === undefined && !s.connected.includes(id)) {
      results[id] = null; // disconnected: safe default, no risk
      continue;
    }
    const right = answer === q.correct;
    results[id] = right;
    if (right) scores[id] += s.alive[id] ? 1000 : 500;
    else if (s.alive[id]) atRisk.push(id);
  }
  return goTo(s, 'questionReveal', display(TIMERS.questionReveal), { scores, results, atRisk });
}

function mathProblems(s: KillerQuizState): { text: string; answer: number }[] {
  const rand = randFor(s, 'math');
  return Array.from({ length: 3 }, () => {
    const op = randInt(rand, 0, 2);
    if (op === 0) {
      const a = randInt(rand, 12, 60);
      const b = randInt(rand, 5, 40);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    if (op === 1) {
      const a = randInt(rand, 30, 90);
      const b = randInt(rand, 5, 29);
      return { text: `${a} − ${b}`, answer: a - b };
    }
    const a = randInt(rand, 3, 12);
    const b = randInt(rand, 2, 9);
    return { text: `${a} × ${b}`, answer: a * b };
  });
}

function startDeath(s: KillerQuizState): KillerQuizState {
  const kind = MINIGAMES[s.deaths % MINIGAMES.length];
  let minigame: Minigame;
  if (kind === 'dice') minigame = { kind, picks: {}, roll: null };
  else if (kind === 'memory') {
    const rand = randFor(s, 'memory');
    minigame = { kind, sequence: Array.from({ length: 5 }, () => randInt(rand, 0, SYMBOLS.length - 1)), guesses: {} };
  } else minigame = { kind, problems: mathProblems(s), answers: {} };
  return goTo(s, 'deathIntro', display(TIMERS.deathIntro), { minigame, deaths: s.deaths + 1 });
}

function beginMinigame(s: KillerQuizState): KillerQuizState {
  switch (s.minigame?.kind) {
    case 'dice':
      return goTo(s, 'dice', input(TIMERS.dice));
    case 'memory':
      return goTo(s, 'memoryShow', display(TIMERS.memoryShow));
    case 'math':
      return goTo(s, 'math', input(TIMERS.math));
    default:
      return afterQuestion(s);
  }
}

function resolveMinigame(s: KillerQuizState): KillerQuizState {
  const g = s.minigame;
  if (!g) return afterQuestion(s);
  const died: string[] = [];
  let minigame: Minigame = g;
  const rand = randFor(s, 'resolve');
  if (g.kind === 'dice') {
    const roll = randInt(rand, 1, 6);
    const picks = { ...g.picks };
    for (const id of s.atRisk) {
      if (!picks[id]) {
        if (!s.connected.includes(id)) continue; // gone: safe default
        picks[id] = shuffle([1, 2, 3, 4, 5, 6], rand).slice(0, 3).sort(); // random default
      }
      if (!picks[id].includes(roll)) died.push(id);
    }
    minigame = { ...g, picks, roll };
  } else if (g.kind === 'memory') {
    for (const id of s.atRisk) {
      const guess = g.guesses[id];
      if (!guess && !s.connected.includes(id)) continue;
      if (!guess || guess.join() !== g.sequence.join()) died.push(id);
    }
  } else {
    for (const id of s.atRisk) {
      const answers = g.answers[id];
      if (!answers && !s.connected.includes(id)) continue;
      const right = g.problems.filter((p, i) => answers?.[i] === p.answer).length;
      if (right < 2) died.push(id);
    }
  }
  const alive = { ...s.alive };
  for (const id of died) alive[id] = false;
  return goTo(s, 'deathReveal', display(TIMERS.deathReveal), { minigame, died, alive });
}

function afterQuestion(s: KillerQuizState): KillerQuizState {
  if (s.qIndex + 1 < Math.min(QUESTIONS, s.questions.length)) return startQuestion(s, s.qIndex + 1);
  const positions = Object.fromEntries(ids(s).map((id) => [id, s.alive[id] ? ALIVE_START : 0]));
  return goTo(s, 'finaleIntro', display(TIMERS.finaleIntro), { positions, minigame: null, atRisk: [], died: [] });
}

function startFinale(s: KillerQuizState, finaleIndex: number): KillerQuizState {
  return goTo(s, 'finale', input(TIMERS.finale), { finaleIndex, finalePicks: {}, lastMoves: {}, round: QUESTIONS + finaleIndex + 1 });
}

function revealFinale(s: KillerQuizState): KillerQuizState {
  const item = s.finale[s.finaleIndex];
  const positions = { ...s.positions };
  const lastMoves: Record<string, number> = {};
  for (const id of ids(s)) {
    const picks = s.finalePicks[id] ?? [];
    const right = picks.filter((i) => item.options[i]?.correct).length;
    const wrong = picks.length - right;
    lastMoves[id] = Math.max(0, right - wrong);
    positions[id] = Math.min(FINISH, (positions[id] ?? 0) + lastMoves[id]);
  }
  const exited = ids(s).filter((id) => positions[id] >= FINISH);
  return goTo(s, 'finaleReveal', display(TIMERS.finaleReveal), { positions, lastMoves, exited });
}

function finish(s: KillerQuizState): KillerQuizState {
  const winnerIds = winners(s);
  const scores = { ...s.scores };
  for (const id of ids(s)) scores[id] += (s.positions[id] ?? 0) * 1000 + (winnerIds.includes(id) ? 10000 : 0);
  return goTo(s, 'done', null, { scores });
}

export function onAction(s: KillerQuizState, action: GameAction): KillerQuizState {
  if (action.type !== 'SUBMIT') return s;
  const payload = payloadOf(action.payload);
  const id = action.playerId;
  if (s.submitted.includes(id)) return s;

  if (s.phase === 'question') {
    const choice = payload.choice;
    const q = s.questions[s.qIndex];
    if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return s;
    return markSubmitted({ ...s, answers: { ...s.answers, [id]: choice } }, id);
  }

  const g = s.minigame;
  if (g && s.atRisk.includes(id)) {
    if (s.phase === 'dice' && g.kind === 'dice') {
      const picks = payload.picks;
      if (!Array.isArray(picks) || picks.length !== 3) return s;
      const clean = [...new Set(picks)].filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 6);
      if (clean.length !== 3) return s;
      return markSubmitted({ ...s, minigame: { ...g, picks: { ...g.picks, [id]: clean.sort() } } }, id);
    }
    if (s.phase === 'memoryInput' && g.kind === 'memory') {
      const seq = payload.sequence;
      if (!Array.isArray(seq) || seq.length !== g.sequence.length) return s;
      if (!seq.every((n) => Number.isInteger(n) && n >= 0 && n < SYMBOLS.length)) return s;
      return markSubmitted({ ...s, minigame: { ...g, guesses: { ...g.guesses, [id]: seq as number[] } } }, id);
    }
    if (s.phase === 'math' && g.kind === 'math') {
      const answers = payload.answers;
      if (!Array.isArray(answers) || answers.length !== g.problems.length) return s;
      const nums = answers.map((a) => (typeof a === 'number' && Number.isFinite(a) ? Math.trunc(a) : Number.NaN));
      return markSubmitted({ ...s, minigame: { ...g, answers: { ...g.answers, [id]: nums } } }, id);
    }
  }

  if (s.phase === 'finale') {
    const item = s.finale[s.finaleIndex];
    const picks = payload.picks;
    if (!Array.isArray(picks)) return s;
    const clean = [...new Set(picks)].filter((n): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < item.options.length);
    return markSubmitted({ ...s, finalePicks: { ...s.finalePicks, [id]: clean } }, id);
  }
  return s;
}

export function onTimerEnd(s: KillerQuizState): KillerQuizState {
  switch (s.phase) {
    case 'intro':
      return s.questions.length > 0 ? startQuestion(s, 0) : afterQuestion({ ...s, qIndex: QUESTIONS });
    case 'question':
      return revealQuestion(s);
    case 'questionReveal':
      return s.atRisk.length > 0 ? startDeath(s) : afterQuestion(s);
    case 'deathIntro':
      return beginMinigame(s);
    case 'memoryShow':
      return goTo(s, 'memoryInput', input(TIMERS.memoryInput));
    case 'dice':
    case 'memoryInput':
    case 'math':
      return resolveMinigame(s);
    case 'deathReveal':
      return afterQuestion(s);
    case 'finaleIntro':
      return s.finale.length > 0 ? startFinale(s, 0) : finish(s);
    case 'finale':
      return revealFinale(s);
    case 'finaleReveal':
      if (s.exited.length > 0 || s.finaleIndex + 1 >= s.finale.length) return finish(s);
      return startFinale(s, s.finaleIndex + 1);
    default:
      return s;
  }
}

export function isStepComplete(s: KillerQuizState): boolean {
  if (s.phase === 'question' || s.phase === 'finale') return allConnectedSubmitted(s, ids(s));
  if (s.phase === 'dice' || s.phase === 'memoryInput' || s.phase === 'math') return allConnectedSubmitted(s, s.atRisk);
  return false;
}

export function winners(s: KillerQuizState): string[] {
  const pool = s.exited.length > 0 ? s.exited : ids(s);
  if (pool.length === 0) return [];
  const best = Math.max(...pool.map((id) => s.positions[id] ?? 0));
  return pool.filter((id) => (s.positions[id] ?? 0) === best);
}

export interface KillerQuizPublic {
  phase: string;
  alive: Record<string, boolean>;
  question: { index: number; total: number; text: string; options: string[]; correct: number | null } | null;
  results: Record<string, boolean | null> | null;
  answers: Record<string, number> | null;
  atRisk: string[];
  minigame:
    | { kind: MinigameKind; sequence?: number[]; problems?: string[]; roll?: number | null; picks?: Record<string, number[]> }
    | null;
  died: string[] | null;
  finale: {
    index: number;
    text: string;
    options: { label: string; correct: boolean | null }[];
    positions: Record<string, number>;
    moves: Record<string, number> | null;
    finish: number;
    exited: string[];
  } | null;
}

export function publicView(s: KillerQuizState): KillerQuizPublic {
  const q = s.questions[s.qIndex];
  const onQuestion = s.phase === 'question' || s.phase === 'questionReveal';
  const revealed = s.phase === 'questionReveal';
  const g = s.minigame;
  let minigame: KillerQuizPublic['minigame'] = null;
  if (g && ['deathIntro', 'dice', 'memoryShow', 'memoryInput', 'math', 'deathReveal'].includes(s.phase)) {
    minigame = { kind: g.kind };
    if (g.kind === 'memory' && (s.phase === 'memoryShow' || s.phase === 'deathReveal')) minigame.sequence = g.sequence;
    if (g.kind === 'math' && (s.phase === 'math' || s.phase === 'deathReveal')) minigame.problems = g.problems.map((p) => p.text);
    if (g.kind === 'dice' && s.phase === 'deathReveal') {
      minigame.roll = g.roll;
      minigame.picks = g.picks;
    }
  }
  const inFinale = ['finaleIntro', 'finale', 'finaleReveal'].includes(s.phase);
  const item = s.finale[s.finaleIndex];
  return {
    phase: s.phase,
    alive: s.alive,
    question: onQuestion && q ? { index: s.qIndex, total: Math.min(QUESTIONS, s.questions.length), text: q.text, options: q.options, correct: revealed ? q.correct : null } : null,
    results: revealed ? s.results : null,
    answers: revealed ? s.answers : null,
    atRisk: s.atRisk,
    minigame,
    died: s.phase === 'deathReveal' ? s.died : null,
    finale:
      inFinale && item
        ? {
            index: s.finaleIndex,
            text: s.phase === 'finaleIntro' ? '' : item.text,
            options: s.phase === 'finaleIntro' ? [] : item.options.map((o) => ({ label: o.label, correct: s.phase === 'finaleReveal' ? o.correct : null })),
            positions: s.positions,
            moves: s.phase === 'finaleReveal' ? s.lastMoves : null,
            finish: FINISH,
            exited: s.exited,
          }
        : null,
  };
}

export type KillerQuizPrivate =
  | { kind: 'question'; answered: number | null; ghost: boolean }
  | { kind: 'dice'; atRisk: boolean; picks: number[] | null }
  | { kind: 'memoryInput'; atRisk: boolean; done: boolean }
  | { kind: 'math'; atRisk: boolean; problems: string[]; done: boolean }
  | { kind: 'finale'; picks: number[] | null; position: number; ghost: boolean };

export function privateView(s: KillerQuizState, playerId: string): KillerQuizPrivate | null {
  const g = s.minigame;
  const atRisk = s.atRisk.includes(playerId);
  switch (s.phase) {
    case 'question':
      return { kind: 'question', answered: s.answers[playerId] ?? null, ghost: !s.alive[playerId] };
    case 'dice':
      return { kind: 'dice', atRisk, picks: g?.kind === 'dice' ? (g.picks[playerId] ?? null) : null };
    case 'memoryInput':
      return { kind: 'memoryInput', atRisk, done: s.submitted.includes(playerId) };
    case 'math':
      return { kind: 'math', atRisk, problems: g?.kind === 'math' ? g.problems.map((p) => p.text) : [], done: s.submitted.includes(playerId) };
    case 'finale':
      return { kind: 'finale', picks: s.finalePicks[playerId] ?? null, position: s.positions[playerId] ?? 0, ghost: !s.alive[playerId] };
    default:
      return null;
  }
}

export function audienceVote(): AudienceVote | null {
  return null;
}

export function isOver(s: KillerQuizState): boolean {
  return s.phase === 'done';
}
