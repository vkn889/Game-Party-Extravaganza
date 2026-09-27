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
import { HOUSE_ID, houseFill, isSmallGroup } from '@/lib/engine/house';
import { draw, rng, shuffle } from '@/lib/engine/rng';
import { isFuzzyMatch, sameText } from '@/lib/engine/text';
import type { AudienceVote, BaseGameState, ContentItem, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const TIMERS = { intro: 8, draw: 90, lie: 45, pick: 25, reveal: 8 };
export const TITLE_MAX = 45;
const GENERIC_DECOYS = ['A very tired wizard', 'Grandpa at the disco', 'The saddest sandwich', 'A haunted bathtub'];

export interface SketchDrawing {
  artistId: string;
  url: string;
  prompt: string;
  decoys: string[];
}

export interface TitleOption {
  id: string;
  text: string;
  kind: 'truth' | 'lie' | 'house';
  authors: string[];
}

export interface SketchyLiesState extends BaseGameState {
  drawRounds: number;
  prompts: ContentItem[];
  assignments: Record<string, ContentItem>;
  drawings: SketchDrawing[];
  current: number;
  lies: Record<string, string>;
  options: TitleOption[];
  picks: Record<string, string>;
  audienceChoice: string | null;
  lastPoints: Record<string, number>;
  errors: Record<string, { text: string; n: number }>;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): SketchyLiesState {
  const drawRounds = players.length <= 4 ? 2 : 1;
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    drawRounds,
    prompts: draw(content['sketchy-lies'] ?? [], players.length * drawRounds, rng(seed, 'content')),
    assignments: {},
    drawings: [],
    current: 0,
    lies: {},
    options: [],
    picks: {},
    audienceChoice: null,
    lastPoints: {},
    errors: {},
  };
}

const ids = (s: SketchyLiesState) => s.players.map((p) => p.id);
const artistOf = (s: SketchyLiesState) => s.drawings[s.current]?.artistId;
const guessers = (s: SketchyLiesState) => ids(s).filter((id) => id !== artistOf(s));

function startDrawRound(s: SketchyLiesState, round: number): SketchyLiesState {
  const offset = (round - 1) * s.players.length;
  const assignments = Object.fromEntries(
    s.players.map((p, i) => [p.id, s.prompts[(offset + i) % Math.max(1, s.prompts.length)] ?? { text: 'A dancing potato' }]),
  );
  return goTo({ ...s, round }, 'draw', input(TIMERS.draw), { assignments, drawings: [], current: 0 });
}

function startLies(s: SketchyLiesState, index: number): SketchyLiesState {
  if (index >= s.drawings.length) {
    return s.round < s.drawRounds ? startDrawRound(s, s.round + 1) : goTo(s, 'done', null);
  }
  return goTo(s, 'lie', input(TIMERS.lie), { current: index, lies: {}, options: [], picks: {}, audienceChoice: null, lastPoints: {}, errors: {} });
}

function startPick(s: SketchyLiesState): SketchyLiesState {
  const drawing = s.drawings[s.current];
  const rand = randFor(s, 'options');
  const merged: { text: string; authors: string[] }[] = [];
  for (const [author, text] of Object.entries(s.lies)) {
    const same = merged.find((m) => sameText(m.text, text));
    if (same) same.authors.push(author);
    else merged.push({ text, authors: [author] });
  }
  const existing = [drawing.prompt, ...merged.map((m) => m.text)];
  const houseCount = isSmallGroup(s.players.length) ? 2 : Math.max(0, 4 - existing.length);
  const decoyPool = drawing.decoys.length ? drawing.decoys : GENERIC_DECOYS;
  let house = houseFill(existing, existing.length + houseCount, decoyPool, rand);
  if (house.length < houseCount) house = [...house, ...houseFill([...existing, ...house], existing.length + houseCount, GENERIC_DECOYS, rand)];
  const options = shuffle(
    [
      { text: drawing.prompt, kind: 'truth' as const, authors: [drawing.artistId] },
      ...merged.map((m) => ({ ...m, kind: 'lie' as const })),
      ...house.map((text) => ({ text, kind: 'house' as const, authors: [HOUSE_ID] })),
    ],
    rand,
  ).map((o, i) => ({ ...o, id: `o${i}` }));
  return goTo(s, 'pick', input(TIMERS.pick), { options });
}

function reveal(s: SketchyLiesState): SketchyLiesState {
  const artist = artistOf(s)!;
  const points: Record<string, number> = {};
  const add = (id: string, pts: number) => {
    if (id !== HOUSE_ID) points[id] = (points[id] ?? 0) + pts;
  };
  for (const [picker, optionId] of Object.entries(s.picks)) {
    const option = s.options.find((o) => o.id === optionId);
    if (!option) continue;
    if (option.kind === 'truth') {
      add(picker, 1000);
      add(artist, 500);
    } else if (option.kind === 'lie') {
      for (const author of option.authors) add(author, 500);
    }
  }
  const scores = { ...s.scores };
  for (const [id, pts] of Object.entries(points)) if (id in scores) scores[id] += pts;
  return goTo(s, 'reveal', display(TIMERS.reveal), { lastPoints: points, scores });
}

function reject(s: SketchyLiesState, id: string, text: string): SketchyLiesState {
  return { ...s, errors: { ...s.errors, [id]: { text, n: (s.errors[id]?.n ?? 0) + 1 } } };
}

export function onAction(s: SketchyLiesState, action: GameAction): SketchyLiesState {
  if (action.type === 'AUDIENCE_VOTE') {
    return s.phase === 'pick' && s.options.some((o) => o.id === action.choiceId) ? { ...s, audienceChoice: action.choiceId } : s;
  }
  const id = action.playerId;
  if (s.submitted.includes(id)) return s;
  if (action.type === 'SUBMIT' && s.phase === 'draw') {
    const url = payloadOf(action.payload).url;
    if (!isDrawingUrl(url, id)) return s;
    const assignment = s.assignments[id];
    const drawing: SketchDrawing = { artistId: id, url, prompt: assignment.text, decoys: assignment.decoys ?? [] };
    return markSubmitted({ ...s, drawings: [...s.drawings, drawing] }, id);
  }
  if (action.type === 'SUBMIT' && s.phase === 'lie' && id !== artistOf(s)) {
    const text = cleanText(s, payloadOf(action.payload).text, TITLE_MAX);
    if (!text) return s;
    const truth = s.drawings[s.current].prompt;
    if (sameText(text, truth) || isFuzzyMatch(text, truth)) return reject(s, id, "That's too close to the real title! Write a lie.");
    return markSubmitted({ ...s, lies: { ...s.lies, [id]: text } }, id);
  }
  if (action.type === 'VOTE' && s.phase === 'pick' && id !== artistOf(s)) {
    const option = s.options.find((o) => o.id === action.choiceId);
    if (!option || option.authors.includes(id)) return s;
    return markSubmitted({ ...s, picks: { ...s.picks, [id]: option.id } }, id);
  }
  return s;
}

export function onTimerEnd(s: SketchyLiesState): SketchyLiesState {
  switch (s.phase) {
    case 'intro':
      return startDrawRound(s, 1);
    case 'draw': {
      // Present drawings in a shuffled order; missing drawings are skipped.
      const drawings = shuffle(s.drawings, randFor(s, 'order'));
      return startLies({ ...s, drawings }, 0);
    }
    case 'lie':
      return startPick(s);
    case 'pick':
      return reveal(s);
    case 'reveal':
      return startLies(s, s.current + 1);
    default:
      return s;
  }
}

export function isStepComplete(s: SketchyLiesState): boolean {
  if (s.phase === 'draw') return allConnectedSubmitted(s, ids(s));
  if (s.phase === 'lie' || s.phase === 'pick') return allConnectedSubmitted(s, guessers(s));
  return false;
}

export interface SketchyLiesPublic {
  drawRound: number;
  drawRounds: number;
  index: number;
  total: number;
  drawingUrl: string | null;
  options: { id: string; text: string }[] | null;
  reveal: {
    artistId: string;
    truthId: string;
    options: TitleOption[];
    picks: Record<string, string>;
    audience: string | null;
    points: Record<string, number>;
  } | null;
}

export function publicView(s: SketchyLiesState): SketchyLiesPublic {
  const drawing = s.drawings[s.current];
  const showing = ['lie', 'pick', 'reveal'].includes(s.phase) && drawing;
  return {
    drawRound: s.round,
    drawRounds: s.drawRounds,
    index: s.current,
    total: s.drawings.length,
    drawingUrl: showing ? drawing.url : null,
    options: s.phase === 'pick' || s.phase === 'reveal' ? s.options.map((o) => ({ id: o.id, text: o.text })) : null,
    reveal:
      s.phase === 'reveal' && drawing
        ? {
            artistId: drawing.artistId,
            truthId: s.options.find((o) => o.kind === 'truth')!.id,
            options: s.options,
            picks: s.picks,
            audience: s.audienceChoice,
            points: s.lastPoints,
          }
        : null,
  };
}

export type SketchyLiesPrivate =
  | { kind: 'draw'; prompt: string; done: boolean }
  | { kind: 'lie'; artist: boolean; done: boolean; error: { text: string; n: number } | null }
  | { kind: 'pick'; artist: boolean; ownOptionIds: string[]; picked: string | null };

export function privateView(s: SketchyLiesState, playerId: string): SketchyLiesPrivate | null {
  if (s.phase === 'draw') return { kind: 'draw', prompt: s.assignments[playerId]?.text ?? '', done: s.submitted.includes(playerId) };
  if (s.phase === 'lie') return { kind: 'lie', artist: artistOf(s) === playerId, done: s.submitted.includes(playerId), error: s.errors[playerId] ?? null };
  if (s.phase === 'pick')
    return {
      kind: 'pick',
      artist: artistOf(s) === playerId,
      ownOptionIds: s.options.filter((o) => o.authors.includes(playerId)).map((o) => o.id),
      picked: s.picks[playerId] ?? null,
    };
  return null;
}

export function audienceVote(s: SketchyLiesState): AudienceVote | null {
  if (s.phase !== 'pick') return null;
  return { prompt: 'Which title is real?', options: s.options.map((o) => ({ id: o.id, label: o.text })) };
}

export function isOver(s: SketchyLiesState): boolean {
  return s.phase === 'done';
}
