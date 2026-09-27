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
import { isSmallGroup } from '@/lib/engine/house';
import { draw, pick, rng, shuffle } from '@/lib/engine/rng';
import { clearWinner, tally } from '@/lib/engine/scoring';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const ROUNDS = 6;
export const TIMERS = { intro: 8, task: 9, act: 7, vote: 30, reveal: 8 };
export const TASK_KINDS = ['hands', 'point', 'number', 'face'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const KIND_LABELS: Record<TaskKind, string> = {
  hands: 'Hands up',
  point: 'Point at someone',
  number: 'Show a number',
  face: 'Make a face',
};

export interface HandsUpHoaxState extends BaseGameState {
  mode: 'classic' | 'maybe';
  tasks: { text: string; kind: TaskKind }[];
  taskIndex: number;
  fakers: string[];
  pastFakers: string[];
  votes: Record<string, string>; // classic: voter -> accused
  guesses: Record<string, Record<string, boolean>>; // maybe: guesser -> (player -> is faking)
  audienceChoice: string | null;
  lastPoints: Record<string, number>;
  accused: string | null;
}

function asKind(value: string | null | undefined): TaskKind {
  return (TASK_KINDS as readonly string[]).includes(value ?? '') ? (value as TaskKind) : 'hands';
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): HandsUpHoaxState {
  const tasks = draw(content['hands-up-hoax'] ?? [], ROUNDS, rng(seed, 'content')).map((t) => ({ text: t.text, kind: asKind(t.answer) }));
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    mode: isSmallGroup(players.length) ? 'maybe' : 'classic',
    tasks,
    taskIndex: 0,
    fakers: [],
    pastFakers: [],
    votes: {},
    guesses: {},
    audienceChoice: null,
    lastPoints: {},
    accused: null,
  };
}

const ids = (s: HandsUpHoaxState) => s.players.map((p) => p.id);

function chooseFakers(s: HandsUpHoaxState): string[] {
  const rand = randFor(s, 'fakers');
  if (s.mode === 'classic') {
    const fresh = ids(s).filter((id) => !s.pastFakers.includes(id));
    return [pick(fresh.length ? fresh : ids(s), rand)];
  }
  // Maybe-faker mode: 0, 1 or 2 fakers (never more than the table has).
  const roll = rand();
  const k = Math.min(ids(s).length, roll < 0.25 ? 0 : roll < 0.75 ? 1 : 2);
  return shuffle(ids(s), rand).slice(0, k);
}

function startRound(s: HandsUpHoaxState, taskIndex: number): HandsUpHoaxState {
  const next = { ...s, taskIndex, round: taskIndex + 1 };
  const fakers = chooseFakers(goTo(next, 'task', null));
  const pastFakers = s.mode === 'classic' ? [...s.pastFakers, ...fakers].slice(-Math.max(1, ids(s).length - 1)) : s.pastFakers;
  return goTo(next, 'task', display(TIMERS.task), { fakers, pastFakers, votes: {}, guesses: {}, audienceChoice: null, lastPoints: {}, accused: null });
}

function reveal(s: HandsUpHoaxState): HandsUpHoaxState {
  const points: Record<string, number> = {};
  const add = (id: string, pts: number) => (points[id] = (points[id] ?? 0) + pts);
  let accused: string | null = null;
  if (s.mode === 'classic') {
    const faker = s.fakers[0];
    accused = clearWinner(tally(s.votes, s.audienceChoice));
    for (const [voter, target] of Object.entries(s.votes)) {
      if (voter !== faker && target === faker) add(voter, 500);
    }
    if (accused !== faker) add(faker, 1000);
  } else {
    for (const [guesser, calls] of Object.entries(s.guesses)) {
      for (const [target, faking] of Object.entries(calls)) {
        const truth = s.fakers.includes(target);
        if (faking === truth) add(guesser, 500);
        else if (truth) add(target, 250); // a faker who fooled someone
      }
    }
  }
  const scores = { ...s.scores };
  for (const [id, pts] of Object.entries(points)) if (id in scores) scores[id] += pts;
  return goTo(s, 'reveal', display(TIMERS.reveal), { lastPoints: points, scores, accused });
}

export function onAction(s: HandsUpHoaxState, action: GameAction): HandsUpHoaxState {
  if (action.type === 'AUDIENCE_VOTE') {
    return s.phase === 'vote' && s.mode === 'classic' && ids(s).includes(action.choiceId) ? { ...s, audienceChoice: action.choiceId } : s;
  }
  if (s.phase !== 'vote' || s.submitted.includes(action.playerId)) return s;
  const id = action.playerId;
  if (action.type === 'VOTE' && s.mode === 'classic') {
    if (action.choiceId === id || !ids(s).includes(action.choiceId)) return s;
    return markSubmitted({ ...s, votes: { ...s.votes, [id]: action.choiceId } }, id);
  }
  if (action.type === 'SUBMIT' && s.mode === 'maybe') {
    const raw = payloadOf(payloadOf(action.payload).guesses);
    const others = ids(s).filter((x) => x !== id);
    if (!others.every((x) => typeof raw[x] === 'boolean')) return s;
    const calls = Object.fromEntries(others.map((x) => [x, raw[x] as boolean]));
    return markSubmitted({ ...s, guesses: { ...s.guesses, [id]: calls } }, id);
  }
  return s;
}

export function onTimerEnd(s: HandsUpHoaxState): HandsUpHoaxState {
  switch (s.phase) {
    case 'intro':
      return s.tasks.length ? startRound(s, 0) : goTo(s, 'done', null);
    case 'task':
      return goTo(s, 'act', display(TIMERS.act));
    case 'act':
      return goTo(s, 'vote', input(TIMERS.vote));
    case 'vote':
      return reveal(s);
    case 'reveal':
      return s.taskIndex + 1 < s.tasks.length ? startRound(s, s.taskIndex + 1) : goTo(s, 'done', null);
    default:
      return s;
  }
}

export function isStepComplete(s: HandsUpHoaxState): boolean {
  return s.phase === 'vote' && allConnectedSubmitted(s, ids(s));
}

export interface HandsUpHoaxPublic {
  mode: 'classic' | 'maybe';
  index: number;
  total: number;
  kind: TaskKind | null;
  reveal: {
    task: string;
    fakers: string[];
    votes: Record<string, string>;
    guesses: Record<string, Record<string, boolean>>;
    audience: string | null;
    accused: string | null;
    points: Record<string, number>;
  } | null;
}

export function publicView(s: HandsUpHoaxState): HandsUpHoaxPublic | null {
  const task = s.tasks[s.taskIndex];
  if (!task || s.phase === 'intro' || s.phase === 'done') return null;
  return {
    mode: s.mode,
    index: s.taskIndex,
    total: s.tasks.length,
    kind: task.kind,
    reveal:
      s.phase === 'reveal'
        ? { task: task.text, fakers: s.fakers, votes: s.votes, guesses: s.guesses, audience: s.audienceChoice, accused: s.accused, points: s.lastPoints }
        : null,
  };
}

export type HandsUpHoaxPrivate =
  | { kind: 'task'; faker: boolean; task: string | null; category: TaskKind }
  | { kind: 'vote'; mode: 'classic' | 'maybe'; done: boolean };

export function privateView(s: HandsUpHoaxState, playerId: string): HandsUpHoaxPrivate | null {
  const task = s.tasks[s.taskIndex];
  if (!task) return null;
  if (s.phase === 'task' || s.phase === 'act') {
    const faker = s.fakers.includes(playerId);
    return { kind: 'task', faker, task: faker ? null : task.text, category: task.kind };
  }
  if (s.phase === 'vote') return { kind: 'vote', mode: s.mode, done: s.submitted.includes(playerId) };
  return null;
}

export function audienceVote(s: HandsUpHoaxState): AudienceVote | null {
  if (s.phase !== 'vote' || s.mode !== 'classic') return null;
  return { prompt: 'Who is the faker?', options: s.players.map((p) => ({ id: p.id, label: p.name })) };
}

export function isOver(s: HandsUpHoaxState): boolean {
  return s.phase === 'done';
}
