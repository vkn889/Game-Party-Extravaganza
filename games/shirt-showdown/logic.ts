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
import { isDrawingUrl } from '@/lib/engine/drawings';
import { HOUSE_DOODLES, HOUSE_ID, isSmallGroup } from '@/lib/engine/house';
import { draw, pick, rng, shuffle } from '@/lib/engine/rng';
import { tally } from '@/lib/engine/scoring';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const TIMERS = { intro: 8, draw: 100, slogan: 70, build: 60, battle: 20, battleReveal: 6, champion: 8 };
export const DRAWINGS_EACH = 2;
export const SLOGANS_EACH = 3;
export const HAND = { drawings: 3, slogans: 4 };
export const SLOGAN_MAX = 40;
const FALLBACK_SLOGANS = ['I survived the party', 'Powered by snacks', 'Certified legend', 'Ask me about my shirt'];

export interface Drawing {
  id: string;
  authorId: string;
  url: string;
}

export interface Slogan {
  id: string;
  authorId: string;
  text: string;
}

export interface Shirt {
  id: string;
  builderId: string; // HOUSE_ID for House remixes
  drawingId: string;
  sloganId: string;
}

export interface Battle {
  left: string;
  right: string;
  votes: Record<string, string>;
  audienceChoice: string | null;
  winner: string | null;
  points: Record<string, number>;
}

export interface ShirtShowdownState extends BaseGameState {
  mode: 'bracket' | 'house';
  shirtsEach: number;
  ideas: Record<string, string[]>;
  houseSlogans: string[];
  drawings: Drawing[];
  slogans: Slogan[];
  hands: Record<string, { drawings: string[]; slogans: string[] }>;
  shirts: Shirt[];
  battles: Battle[];
  current: number;
  advancing: string[];
  bye: string | null;
  bracketRound: number;
  champion: string | null;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): ShirtShowdownState {
  const rand = rng(seed, 'content');
  const pack = content['shirt-showdown'] ?? [];
  const ideaPool = draw(pack, players.length * 2, rand);
  const ideas = Object.fromEntries(players.map((p, i) => [p.id, ideaPool.slice(i * 2, i * 2 + 2).map((x) => x.text)]));
  const houseSlogans = shuffle(pack.flatMap((x) => x.decoys ?? []), rand).slice(0, 24);
  const small = isSmallGroup(players.length);
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    mode: small ? 'house' : 'bracket',
    shirtsEach: small ? 2 : 1,
    ideas,
    houseSlogans: houseSlogans.length ? houseSlogans : FALLBACK_SLOGANS,
    drawings: [],
    slogans: [],
    hands: {},
    shirts: [],
    battles: [],
    current: 0,
    advancing: [],
    bye: null,
    bracketRound: 0,
    champion: null,
  };
}

const ids = (s: ShirtShowdownState) => s.players.map((p) => p.id);
const count = <T extends { authorId: string }>(list: T[], id: string) => list.filter((x) => x.authorId === id).length;
export const shirtsBy = (s: ShirtShowdownState, id: string) => s.shirts.filter((x) => x.builderId === id);

/** Deals each player a hand of other people's drawings and slogans, topped up by the House. */
function deal(s: ShirtShowdownState): ShirtShowdownState {
  const rand = randFor(s, 'deal');
  let drawings = s.drawings.slice();
  let slogans = s.slogans.slice();
  const minDrawings = HAND.drawings + 1;
  const minSlogans = HAND.slogans + 1;
  for (let i = 0; drawings.length < minDrawings; i++) {
    drawings = [...drawings, { id: `hd${i}`, authorId: HOUSE_ID, url: HOUSE_DOODLES[i % HOUSE_DOODLES.length] }];
  }
  for (let i = 0; slogans.length < minSlogans; i++) {
    slogans = [...slogans, { id: `hs${i}`, authorId: HOUSE_ID, text: s.houseSlogans[i % s.houseSlogans.length] }];
  }
  const hands: ShirtShowdownState['hands'] = {};
  for (const id of ids(s)) {
    const pickFrom = <T extends { id: string; authorId: string }>(list: T[], n: number) => {
      const others = shuffle(
        list.filter((x) => x.authorId !== id),
        rand,
      );
      const own = shuffle(
        list.filter((x) => x.authorId === id),
        rand,
      );
      return [...others, ...own].slice(0, n).map((x) => x.id);
    };
    hands[id] = { drawings: pickFrom(drawings, HAND.drawings), slogans: pickFrom(slogans, HAND.slogans) };
  }
  return { ...s, drawings, slogans, hands };
}

function autoBuild(s: ShirtShowdownState): ShirtShowdownState {
  let shirts = s.shirts.slice();
  const rand = randFor(s, 'autobuild');
  for (const id of ids(s)) {
    const hand = s.hands[id];
    while (shirts.filter((x) => x.builderId === id).length < s.shirtsEach && hand) {
      const used = shirts.filter((x) => x.builderId === id);
      const drawingId = pick(hand.drawings.filter((d) => !used.some((u) => u.drawingId === d)), rand) ?? hand.drawings[0];
      const sloganId = pick(hand.slogans.filter((t) => !used.some((u) => u.sloganId === t)), rand) ?? hand.slogans[0];
      shirts = [...shirts, { id: `sh${shirts.length}`, builderId: id, drawingId, sloganId }];
    }
  }
  return { ...s, shirts };
}

function newBattle(left: string, right: string): Battle {
  return { left, right, votes: {}, audienceChoice: null, winner: null, points: {} };
}

function startBracketRound(s: ShirtShowdownState, shirtIds: string[]): ShirtShowdownState {
  const battles: Battle[] = [];
  for (let i = 0; i + 1 < shirtIds.length; i += 2) battles.push(newBattle(shirtIds[i], shirtIds[i + 1]));
  const bye = shirtIds.length % 2 === 1 ? shirtIds[shirtIds.length - 1] : null;
  return goTo(s, 'battle', input(TIMERS.battle), { battles, current: 0, advancing: [], bye, bracketRound: s.bracketRound + 1, round: s.bracketRound + 1 });
}

function startBattles(s: ShirtShowdownState): ShirtShowdownState {
  const built = autoBuild(s);
  const rand = randFor(built, 'battles');
  if (built.mode === 'bracket') {
    return startBracketRound(
      built,
      shuffle(
        built.shirts.map((x) => x.id),
        rand,
      ),
    );
  }
  // House mode: every player shirt faces a House remix of pool pieces.
  let shirts = built.shirts.slice();
  let slogans = built.slogans.slice();
  const battles: Battle[] = [];
  for (const shirt of shuffle(built.shirts, rand)) {
    const drawing = pick(built.drawings.filter((d) => d.id !== shirt.drawingId), rand) ?? built.drawings[0];
    const houseSlogan: Slogan = { id: `s${slogans.length}`, authorId: HOUSE_ID, text: pick(built.houseSlogans, rand) };
    const remix: Shirt = { id: `sh${shirts.length}`, builderId: HOUSE_ID, drawingId: drawing.id, sloganId: houseSlogan.id };
    shirts = [...shirts, remix];
    slogans = [...slogans, houseSlogan];
    battles.push(rand() < 0.5 ? newBattle(shirt.id, remix.id) : newBattle(remix.id, shirt.id));
  }
  return goTo({ ...built, shirts, slogans }, 'battle', input(TIMERS.battle), { battles, current: 0, round: 1 });
}

export function votersFor(s: ShirtShowdownState, battle: Battle): string[] {
  const builders = [battle.left, battle.right].map((id) => s.shirts.find((x) => x.id === id)?.builderId);
  return ids(s).filter((id) => !builders.includes(id));
}

function resolveBattle(s: ShirtShowdownState): ShirtShowdownState {
  const battle = s.battles[s.current];
  const counts = tally(battle.votes, battle.audienceChoice);
  const l = counts[battle.left] ?? 0;
  const r = counts[battle.right] ?? 0;
  const shirtOf = (id: string) => s.shirts.find((x) => x.id === id)!;
  let winner: string | null = l > r ? battle.left : r > l ? battle.right : null;
  if (!winner && s.mode === 'bracket') winner = randFor(s, 'tiebreak')() < 0.5 ? battle.left : battle.right;
  const points: Record<string, number> = {};
  const add = (id: string, pts: number) => {
    if (id !== HOUSE_ID && id in s.scores) points[id] = (points[id] ?? 0) + pts;
  };
  add(shirtOf(battle.left).builderId, l * 100);
  add(shirtOf(battle.right).builderId, r * 100);
  if (winner) {
    const w = shirtOf(winner);
    add(w.builderId, s.mode === 'house' ? 500 : 300);
    if (w.builderId !== HOUSE_ID) {
      add(s.drawings.find((d) => d.id === w.drawingId)?.authorId ?? HOUSE_ID, 100);
      add(s.slogans.find((t) => t.id === w.sloganId)?.authorId ?? HOUSE_ID, 100);
    }
  }
  const scores = { ...s.scores };
  for (const [id, pts] of Object.entries(points)) scores[id] += pts;
  const battles = s.battles.map((b, i) => (i === s.current ? { ...b, winner, points } : b));
  return goTo(s, 'battleReveal', display(TIMERS.battleReveal), {
    battles,
    scores,
    advancing: winner ? [...s.advancing, winner] : s.advancing,
  });
}

function afterReveal(s: ShirtShowdownState): ShirtShowdownState {
  if (s.current + 1 < s.battles.length) return goTo(s, 'battle', input(TIMERS.battle), { current: s.current + 1 });
  if (s.mode === 'house') return goTo(s, 'done', null);
  const next = s.bye ? [...s.advancing, s.bye] : s.advancing;
  if (next.length <= 1) {
    const champion = next[0] ?? null;
    const scores = { ...s.scores };
    const builder = champion ? s.shirts.find((x) => x.id === champion)?.builderId : null;
    if (builder && builder in scores) scores[builder] += 1000;
    return goTo(s, 'champion', display(TIMERS.champion), { champion, scores });
  }
  return startBracketRound(s, next);
}

export function onAction(s: ShirtShowdownState, action: GameAction): ShirtShowdownState {
  if (action.type === 'AUDIENCE_VOTE') {
    if (s.phase !== 'battle') return s;
    const b = s.battles[s.current];
    if (action.choiceId !== b.left && action.choiceId !== b.right) return s;
    return { ...s, battles: s.battles.map((x, i) => (i === s.current ? { ...x, audienceChoice: action.choiceId } : x)) };
  }
  const id = action.playerId;
  if (s.submitted.includes(id)) return s;

  if (action.type === 'SUBMIT') {
    const p = payloadOf(action.payload);
    if (s.phase === 'draw') {
      if (!isDrawingUrl(p.url, id) || count(s.drawings, id) >= DRAWINGS_EACH || s.drawings.some((d) => d.url === p.url)) return s;
      const drawings = [...s.drawings, { id: `d${s.drawings.length}`, authorId: id, url: p.url as string }];
      const next = { ...s, drawings };
      return count(drawings, id) >= DRAWINGS_EACH ? markSubmitted(next, id) : next;
    }
    if (s.phase === 'slogan') {
      const text = cleanText(s, p.text, SLOGAN_MAX);
      if (!text || count(s.slogans, id) >= SLOGANS_EACH) return s;
      const slogans = [...s.slogans, { id: `s${s.slogans.length}`, authorId: id, text }];
      const next = { ...s, slogans };
      return count(slogans, id) >= SLOGANS_EACH ? markSubmitted(next, id) : next;
    }
    if (s.phase === 'build') {
      const hand = s.hands[id];
      const mine = shirtsBy(s, id);
      if (!hand || mine.length >= s.shirtsEach) return s;
      if (!hand.drawings.includes(p.drawingId as string) || !hand.slogans.includes(p.sloganId as string)) return s;
      if (mine.some((x) => x.drawingId === p.drawingId || x.sloganId === p.sloganId)) return s;
      const shirts = [...s.shirts, { id: `sh${s.shirts.length}`, builderId: id, drawingId: p.drawingId as string, sloganId: p.sloganId as string }];
      const next = { ...s, shirts };
      return shirtsBy(next, id).length >= s.shirtsEach ? markSubmitted(next, id) : next;
    }
  }

  if (action.type === 'VOTE' && s.phase === 'battle') {
    const b = s.battles[s.current];
    if (!votersFor(s, b).includes(id)) return s;
    if (action.choiceId !== b.left && action.choiceId !== b.right) return s;
    const battles = s.battles.map((x, i) => (i === s.current ? { ...x, votes: { ...x.votes, [id]: action.choiceId } } : x));
    return markSubmitted({ ...s, battles }, id);
  }
  return s;
}

export function onTimerEnd(s: ShirtShowdownState): ShirtShowdownState {
  switch (s.phase) {
    case 'intro':
      return goTo(s, 'draw', input(TIMERS.draw));
    case 'draw':
      return goTo(s, 'slogan', input(TIMERS.slogan));
    case 'slogan':
      return goTo(deal(s), 'build', input(TIMERS.build));
    case 'build':
      return startBattles(s);
    case 'battle':
      return resolveBattle(s);
    case 'battleReveal':
      return afterReveal(s);
    case 'champion':
      return goTo(s, 'done', null);
    default:
      return s;
  }
}

export function isStepComplete(s: ShirtShowdownState): boolean {
  if (s.phase === 'draw' || s.phase === 'slogan' || s.phase === 'build') return allConnectedSubmitted(s, ids(s));
  if (s.phase === 'battle') return allConnectedSubmitted(s, votersFor(s, s.battles[s.current]));
  return false;
}

export interface ShirtView {
  id: string;
  drawingUrl: string;
  slogan: string;
}

export interface ShirtShowdownPublic {
  mode: 'bracket' | 'house';
  battleIndex: number;
  battleCount: number;
  bracketRound: number;
  left: ShirtView | null;
  right: ShirtView | null;
  reveal: {
    builders: Record<string, string>;
    votes: Record<string, string[]>;
    audience: string | null;
    winner: string | null;
    points: Record<string, number>;
    credits: Record<string, { drawing: string; slogan: string }>;
  } | null;
  champion: (ShirtView & { builderId: string }) | null;
  bye: string | null;
}

function shirtView(s: ShirtShowdownState, id: string): ShirtView | null {
  const shirt = s.shirts.find((x) => x.id === id);
  if (!shirt) return null;
  return {
    id,
    drawingUrl: s.drawings.find((d) => d.id === shirt.drawingId)?.url ?? HOUSE_DOODLES[0],
    slogan: s.slogans.find((t) => t.id === shirt.sloganId)?.text ?? '',
  };
}

export function publicView(s: ShirtShowdownState): ShirtShowdownPublic {
  const b = s.battles[s.current];
  const inBattle = (s.phase === 'battle' || s.phase === 'battleReveal') && b;
  const reveal = s.phase === 'battleReveal' && b;
  const shirt = (id: string) => s.shirts.find((x) => x.id === id);
  const championShirt = s.champion ? shirtView(s, s.champion) : null;
  return {
    mode: s.mode,
    battleIndex: s.current,
    battleCount: s.battles.length,
    bracketRound: s.bracketRound,
    left: inBattle ? shirtView(s, b.left) : null,
    right: inBattle ? shirtView(s, b.right) : null,
    reveal: reveal
      ? {
          builders: { [b.left]: shirt(b.left)!.builderId, [b.right]: shirt(b.right)!.builderId },
          votes: {
            [b.left]: Object.keys(b.votes).filter((v) => b.votes[v] === b.left),
            [b.right]: Object.keys(b.votes).filter((v) => b.votes[v] === b.right),
          },
          audience: b.audienceChoice,
          winner: b.winner,
          points: b.points,
          credits: Object.fromEntries(
            [b.left, b.right].map((id) => {
              const x = shirt(id)!;
              return [
                id,
                {
                  drawing: s.drawings.find((d) => d.id === x.drawingId)?.authorId ?? HOUSE_ID,
                  slogan: s.slogans.find((t) => t.id === x.sloganId)?.authorId ?? HOUSE_ID,
                },
              ];
            }),
          ),
        }
      : null,
    champion: s.phase === 'champion' && championShirt ? { ...championShirt, builderId: shirt(s.champion!)!.builderId } : null,
    bye: s.phase === 'battle' ? s.bye : null,
  };
}

export type ShirtShowdownPrivate =
  | { kind: 'draw'; ideas: string[]; done: number; needed: number }
  | { kind: 'slogan'; done: number; needed: number }
  | {
      kind: 'build';
      drawings: { id: string; url: string }[];
      slogans: { id: string; text: string }[];
      built: { drawingId: string; sloganId: string }[];
      needed: number;
    }
  | { kind: 'battle'; canVote: boolean; voted: string | null };

export function privateView(s: ShirtShowdownState, playerId: string): ShirtShowdownPrivate | null {
  switch (s.phase) {
    case 'draw':
      return { kind: 'draw', ideas: s.ideas[playerId] ?? [], done: count(s.drawings, playerId), needed: DRAWINGS_EACH };
    case 'slogan':
      return { kind: 'slogan', done: count(s.slogans, playerId), needed: SLOGANS_EACH };
    case 'build': {
      const hand = s.hands[playerId] ?? { drawings: [], slogans: [] };
      return {
        kind: 'build',
        drawings: hand.drawings.map((id) => ({ id, url: s.drawings.find((d) => d.id === id)?.url ?? '' })),
        slogans: hand.slogans.map((id) => ({ id, text: s.slogans.find((t) => t.id === id)?.text ?? '' })),
        built: shirtsBy(s, playerId).map((x) => ({ drawingId: x.drawingId, sloganId: x.sloganId })),
        needed: s.shirtsEach,
      };
    }
    case 'battle': {
      const b = s.battles[s.current];
      return { kind: 'battle', canVote: votersFor(s, b).includes(playerId), voted: b.votes[playerId] ?? null };
    }
    default:
      return null;
  }
}

export function audienceVote(s: ShirtShowdownState): AudienceVote | null {
  if (s.phase !== 'battle') return null;
  const b = s.battles[s.current];
  const l = shirtView(s, b.left);
  const r = shirtView(s, b.right);
  return {
    prompt: 'Which shirt wins?',
    options: [
      { id: b.left, label: `Left: "${l?.slogan ?? ''}"` },
      { id: b.right, label: `Right: "${r?.slogan ?? ''}"` },
    ],
  };
}

export function isOver(s: ShirtShowdownState): boolean {
  return s.phase === 'done';
}
