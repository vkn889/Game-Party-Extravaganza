import { allConnectedSubmitted, createBase, display, goTo, input, markSubmitted } from '@/lib/engine/base';
import { isSmallGroup } from '@/lib/engine/house';
import { draw, rng } from '@/lib/engine/rng';
import { plurality, tally } from '@/lib/engine/scoring';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const PROMPTS = 10;
export const TIMERS = { intro: 7, vote: 20, reveal: 6 };

export interface MostLikelyToState extends BaseGameState {
  mode: 'crowd' | 'meOrYou';
  prompts: string[];
  pIndex: number;
  votes: Record<string, string>;
  audienceChoice: string | null;
  top: string[];
  lastPoints: Record<string, number>;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): MostLikelyToState {
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    mode: isSmallGroup(players.length) ? 'meOrYou' : 'crowd',
    prompts: draw(content['most-likely-to'] ?? [], PROMPTS, rng(seed, 'content')).map((p) => p.text),
    pIndex: 0,
    votes: {},
    audienceChoice: null,
    top: [],
    lastPoints: {},
  };
}

const ids = (s: MostLikelyToState) => s.players.map((p) => p.id);

function start(s: MostLikelyToState, pIndex: number): MostLikelyToState {
  if (pIndex >= s.prompts.length) return goTo(s, 'done', null);
  return goTo(s, 'vote', input(TIMERS.vote), { pIndex, round: pIndex + 1, votes: {}, audienceChoice: null, top: [], lastPoints: {} });
}

function reveal(s: MostLikelyToState): MostLikelyToState {
  const points: Record<string, number> = {};
  const counts = tally(s.votes, s.audienceChoice);
  const top = plurality(counts);
  if (s.mode === 'crowd') {
    // Score by matching the majority; a spread of single votes has no majority to match.
    const best = top.length ? counts[top[0]] : 0;
    if (best >= 2) {
      for (const [voter, choice] of Object.entries(s.votes)) if (top.includes(choice)) points[voter] = 500;
    }
  } else {
    // "Me or you?": you score for every other player who picked the same person.
    for (const [voter, choice] of Object.entries(s.votes)) {
      const agree = Object.entries(s.votes).filter(([other, c]) => other !== voter && c === choice).length;
      if (agree) points[voter] = agree * 500;
    }
  }
  const scores = { ...s.scores };
  for (const [id, pts] of Object.entries(points)) scores[id] += pts;
  return goTo(s, 'reveal', display(TIMERS.reveal), { top, lastPoints: points, scores });
}

export function onAction(s: MostLikelyToState, action: GameAction): MostLikelyToState {
  if (s.phase !== 'vote') return s;
  if (action.type === 'AUDIENCE_VOTE') return ids(s).includes(action.choiceId) ? { ...s, audienceChoice: action.choiceId } : s;
  if (action.type !== 'VOTE' || s.submitted.includes(action.playerId) || !ids(s).includes(action.choiceId)) return s;
  return markSubmitted({ ...s, votes: { ...s.votes, [action.playerId]: action.choiceId } }, action.playerId);
}

export function onTimerEnd(s: MostLikelyToState): MostLikelyToState {
  switch (s.phase) {
    case 'intro':
      return start(s, 0);
    case 'vote':
      return reveal(s);
    case 'reveal':
      return start(s, s.pIndex + 1);
    default:
      return s;
  }
}

export function isStepComplete(s: MostLikelyToState): boolean {
  return s.phase === 'vote' && allConnectedSubmitted(s, ids(s));
}

export interface MostLikelyToPublic {
  mode: 'crowd' | 'meOrYou';
  index: number;
  total: number;
  prompt: string;
  reveal: { votes: Record<string, string>; audience: string | null; top: string[]; points: Record<string, number> } | null;
}

export function publicView(s: MostLikelyToState): MostLikelyToPublic | null {
  const prompt = s.prompts[s.pIndex];
  if (prompt == null || s.phase === 'intro' || s.phase === 'done') return null;
  return {
    mode: s.mode,
    index: s.pIndex,
    total: s.prompts.length,
    prompt,
    // Votes are anonymous while voting is open.
    reveal: s.phase === 'reveal' ? { votes: s.votes, audience: s.audienceChoice, top: s.top, points: s.lastPoints } : null,
  };
}

export function privateView(s: MostLikelyToState, playerId: string): { voted: string | null } | null {
  return s.phase === 'vote' ? { voted: s.votes[playerId] ?? null } : null;
}

export function audienceVote(s: MostLikelyToState): AudienceVote | null {
  if (s.phase !== 'vote') return null;
  return { prompt: s.prompts[s.pIndex], options: s.players.map((p) => ({ id: p.id, label: p.name })) };
}

export function isOver(s: MostLikelyToState): boolean {
  return s.phase === 'done';
}
