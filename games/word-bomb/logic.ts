import { createBase, display, gameClock, goTo, payloadOf, randFor } from '@/lib/engine/base';
import { isProfane } from '@/lib/engine/filter';
import { randInt, rng, shuffle } from '@/lib/engine/rng';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';
import { isWord } from './dictionary';

export const LIVES = 3;
export const MAX_TURNS = 150;
export const TIMERS = { intro: 8, boom: 3 };

export interface WordBombState extends BaseGameState {
  combos: string[];
  comboIndex: number;
  order: string[];
  active: number; // index into order
  lives: Record<string, number>;
  used: string[];
  lastWord: { playerId: string; word: string } | null;
  boomId: string | null;
  turnCount: number;
  eliminated: string[];
  errors: Record<string, { text: string; n: number }>;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): WordBombState {
  const rand = rng(seed, 'content');
  const pack = content['word-bomb'] ?? [];
  const easy = shuffle(
    pack.filter((c) => c.answer === 'easy').map((c) => c.text.toLowerCase()),
    rand,
  );
  const medium = shuffle(
    pack.filter((c) => c.answer !== 'easy').map((c) => c.text.toLowerCase()),
    rand,
  );
  // Start easy, then mix in harder combos.
  const combos = [...easy.slice(0, 8), ...shuffle([...easy.slice(8), ...medium], rand)];
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    combos: combos.length ? combos : ['in', 'er', 'an', 'at'],
    comboIndex: 0,
    order: shuffle(
      players.map((p) => p.id),
      rand,
    ),
    active: 0,
    lives: Object.fromEntries(players.map((p) => [p.id, LIVES])),
    used: [],
    lastWord: null,
    boomId: null,
    turnCount: 0,
    eliminated: [],
    errors: {},
  };
}

export const activeId = (s: WordBombState) => s.order[s.active];
const alive = (s: WordBombState) => s.order.filter((id) => s.lives[id] > 0);
export const combo = (s: WordBombState) => s.combos[s.comboIndex % s.combos.length];

/** The fuse shortens as the game goes on. It's hidden from every screen. */
export function fuseSeconds(s: WordBombState): number {
  const max = Math.max(7, 15 - Math.floor(s.turnCount / 6));
  return randInt(randFor(s, 'fuse'), Math.max(5, max - 5), max);
}

function nextAliveIndex(s: WordBombState, from: number): number {
  for (let k = 1; k <= s.order.length; k++) {
    const i = (from + k) % s.order.length;
    if (s.lives[s.order[i]] > 0) return i;
  }
  return from;
}

function startTurn(s: WordBombState, active: number, newCombo: boolean): WordBombState {
  if (alive(s).length <= 1 || s.turnCount >= MAX_TURNS) return finish(s);
  const next = { ...s, active, comboIndex: newCombo ? s.comboIndex + 1 : s.comboIndex, turnCount: s.turnCount + 1, boomId: null, errors: {} };
  return goTo(next, 'turn', gameClock(fuseSeconds(next), true), { round: next.turnCount });
}

function finish(s: WordBombState): WordBombState {
  const scores = { ...s.scores };
  for (const id of alive(s)) scores[id] += 1000;
  return goTo(s, 'done', null, { scores });
}

export function winners(s: WordBombState): string[] {
  const living = alive(s);
  if (living.length === 0) return [];
  const most = Math.max(...living.map((id) => s.lives[id]));
  return living.filter((id) => s.lives[id] === most);
}

function reject(s: WordBombState, id: string, text: string): WordBombState {
  return { ...s, errors: { ...s.errors, [id]: { text, n: (s.errors[id]?.n ?? 0) + 1 } } };
}

export function onAction(s: WordBombState, action: GameAction): WordBombState {
  if (action.type !== 'SUBMIT' || s.phase !== 'turn') return s;
  const id = action.playerId;
  if (id !== activeId(s)) return s;
  const raw = payloadOf(action.payload).word;
  if (typeof raw !== 'string') return s;
  const word = raw.trim().toLowerCase();
  const c = combo(s);
  if (!/^[a-z]{3,20}$/.test(word)) return reject(s, id, 'Letters only, 3 or more.');
  if (!word.includes(c)) return reject(s, id, `It needs "${c.toUpperCase()}" in it!`);
  if (s.used.includes(word)) return reject(s, id, 'Already used this game!');
  if (!isWord(word)) return reject(s, id, 'Not in the dictionary!');
  if (s.settings.familyFriendly && isProfane(word)) return reject(s, id, 'Keep it family friendly!');
  const points = 100 + (word.length >= 8 ? 50 : 0);
  const next: WordBombState = {
    ...s,
    used: [...s.used, word],
    lastWord: { playerId: id, word },
    scores: { ...s.scores, [id]: s.scores[id] + points },
  };
  return startTurn(next, nextAliveIndex(next, s.active), true);
}

export function onTimerEnd(s: WordBombState): WordBombState {
  switch (s.phase) {
    case 'intro':
      return startTurn({ ...s, turnCount: 0 }, s.lives[s.order[0]] > 0 ? 0 : nextAliveIndex(s, 0), false);
    case 'turn': {
      const id = activeId(s);
      const othersHere = alive(s).some((x) => x !== id && s.connected.includes(x));
      if (!s.connected.includes(id) && othersHere) {
        // Gone players are skipped rather than blown up (safe default).
        return startTurn(s, nextAliveIndex(s, s.active), false);
      }
      const lives = { ...s.lives, [id]: Math.max(0, s.lives[id] - 1) };
      const eliminated = lives[id] === 0 ? [...s.eliminated, id] : s.eliminated;
      return goTo(s, 'boom', display(TIMERS.boom), { lives, eliminated, boomId: id });
    }
    case 'boom':
      return startTurn(s, nextAliveIndex(s, s.active), true);
    default:
      return s;
  }
}

export function isStepComplete(s: WordBombState): boolean {
  if (s.phase !== 'turn') return false;
  const id = activeId(s);
  return !s.connected.includes(id) && alive(s).some((x) => x !== id && s.connected.includes(x));
}

export interface WordBombPublic {
  combo: string;
  activeId: string;
  order: string[];
  lives: Record<string, number>;
  lastWord: { playerId: string; word: string } | null;
  boomId: string | null;
  wordsUsed: number;
}

export function publicView(s: WordBombState): WordBombPublic | null {
  if (s.phase === 'intro' || s.phase === 'done') return null;
  return {
    combo: combo(s).toUpperCase(),
    activeId: activeId(s),
    order: s.order,
    lives: s.lives,
    lastWord: s.lastWord,
    boomId: s.boomId,
    wordsUsed: s.used.length,
  };
}

export function privateView(s: WordBombState, playerId: string): { active: boolean; lives: number; error: { text: string; n: number } | null } | null {
  if (s.phase !== 'turn' && s.phase !== 'boom') return null;
  return { active: s.phase === 'turn' && activeId(s) === playerId, lives: s.lives[playerId] ?? 0, error: s.errors[playerId] ?? null };
}

export function audienceVote(): AudienceVote | null {
  return null;
}

export function isOver(s: WordBombState): boolean {
  return s.phase === 'done';
}
