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
import { HOUSE_ID, isSmallGroup } from '@/lib/engine/house';
import { pick, rng, shuffle } from '@/lib/engine/rng';
import { tally } from '@/lib/engine/scoring';
import type { AudienceVote, BaseGameState, ContentPacks, GameAction, Player, RoomSettings } from '@/lib/types';

export const TIMERS = { intro: 8, write: 60, draw: 90, describe: 45, show: 4, bookVote: 20, bookResult: 6 };
const FALLBACK_SENTENCES = ['A cat ruling a kingdom of socks', 'The moon is having a bad hair day', 'A penguin opens a lemonade stand'];

export interface Entry {
  kind: 'text' | 'drawing';
  authorId: string;
  content: string;
  missing: boolean;
}

export interface Book {
  ownerId: string;
  entries: Entry[];
}

export interface DoodleTelephoneState extends BaseGameState {
  chainLength: number;
  link: number;
  suggestions: Record<string, string>;
  houseSentences: string[];
  books: Book[];
  bookIndex: number;
  revealIndex: number;
  votes: Record<string, string>;
  audienceChoice: string | null;
  lastPoints: Record<string, number>;
}

/** 2-3 players loop the chain around the group twice so every book has 4+ steps. */
export function chainLengthFor(players: number): number {
  return isSmallGroup(players) ? players * 2 : players;
}

export function init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): DoodleTelephoneState {
  const rand = rng(seed, 'content');
  const pool = shuffle(
    (content['doodle-telephone'] ?? []).map((x) => x.text),
    rand,
  );
  const sentences = pool.length ? pool : FALLBACK_SENTENCES;
  return {
    ...createBase(players, settings, seed),
    timer: display(TIMERS.intro),
    chainLength: chainLengthFor(players.length),
    link: 0,
    suggestions: Object.fromEntries(players.map((p, i) => [p.id, sentences[i % sentences.length]])),
    houseSentences: sentences,
    books: players.map((p) => ({ ownerId: p.id, entries: [] })),
    bookIndex: 0,
    revealIndex: 0,
    votes: {},
    audienceChoice: null,
    lastPoints: {},
  };
}

const ids = (s: DoodleTelephoneState) => s.players.map((p) => p.id);
export const kindForLink = (link: number): Entry['kind'] => (link % 2 === 0 ? 'text' : 'drawing');

/** The book a player works on at the current link. */
export function bookFor(s: DoodleTelephoneState, playerId: string): number {
  const n = s.players.length;
  const i = s.players.findIndex((p) => p.id === playerId);
  return (((i - s.link) % n) + n) % n;
}

/** The most recent entry that actually arrived: what the next person works from. */
export function sourceEntry(book: Book): Entry | null {
  for (let i = book.entries.length - 1; i >= 0; i--) if (!book.entries[i].missing) return book.entries[i];
  return null;
}

function startLink(s: DoodleTelephoneState, link: number): DoodleTelephoneState {
  if (link >= s.chainLength) return goTo(s, 'showBook', display(TIMERS.show), { bookIndex: 0, revealIndex: 1, votes: {}, audienceChoice: null, lastPoints: {} });
  const kind = kindForLink(link);
  const phase = link === 0 ? 'write' : kind === 'drawing' ? 'draw' : 'describe';
  const seconds = link === 0 ? TIMERS.write : kind === 'drawing' ? TIMERS.draw : TIMERS.describe;
  return goTo(s, phase, input(seconds), { link, round: link + 1 });
}

function fillMissing(s: DoodleTelephoneState): DoodleTelephoneState {
  const rand = randFor(s, 'fill');
  const books = s.books.map((book, b) => {
    if (book.entries.length > s.link) return book;
    const n = s.players.length;
    const authorId = s.players[(b + s.link) % n].id;
    const entry: Entry =
      s.link === 0
        ? { kind: 'text', authorId: HOUSE_ID, content: pick(s.houseSentences, rand), missing: false }
        : { kind: kindForLink(s.link), authorId, content: '', missing: true };
    return { ...book, entries: [...book.entries, entry] };
  });
  return { ...s, books };
}

function startBook(s: DoodleTelephoneState, bookIndex: number): DoodleTelephoneState {
  if (bookIndex >= s.books.length) return goTo(s, 'done', null);
  return goTo(s, 'showBook', display(TIMERS.show), { bookIndex, revealIndex: 1, votes: {}, audienceChoice: null, lastPoints: {} });
}

function scoreBook(s: DoodleTelephoneState): DoodleTelephoneState {
  const book = s.books[s.bookIndex];
  const counts = tally(s.votes, s.audienceChoice);
  const points: Record<string, number> = {};
  for (const [entryIndex, n] of Object.entries(counts)) {
    const author = book.entries[Number(entryIndex)]?.authorId;
    if (author && author !== HOUSE_ID) points[author] = (points[author] ?? 0) + n * 500;
  }
  const scores = { ...s.scores };
  for (const [id, pts] of Object.entries(points)) if (id in scores) scores[id] += pts;
  return goTo(s, 'bookResult', display(TIMERS.bookResult), { scores, lastPoints: points });
}

export function onAction(s: DoodleTelephoneState, action: GameAction): DoodleTelephoneState {
  if (action.type === 'AUDIENCE_VOTE') {
    const entry = s.books[s.bookIndex]?.entries[Number(action.choiceId)];
    return s.phase === 'bookVote' && entry && !entry.missing ? { ...s, audienceChoice: action.choiceId } : s;
  }
  const id = action.playerId;
  if (s.submitted.includes(id)) return s;
  if (action.type === 'SUBMIT' && ['write', 'draw', 'describe'].includes(s.phase)) {
    const b = bookFor(s, id);
    const book = s.books[b];
    if (!book || book.entries.length !== s.link) return s;
    const payload = payloadOf(action.payload);
    let entry: Entry;
    if (s.phase === 'draw') {
      if (!isDrawingUrl(payload.url, id)) return s;
      entry = { kind: 'drawing', authorId: id, content: payload.url, missing: false };
    } else {
      const text = cleanText(s, payload.text);
      if (!text) return s;
      entry = { kind: 'text', authorId: id, content: text, missing: false };
    }
    const books = s.books.map((x, i) => (i === b ? { ...x, entries: [...x.entries, entry] } : x));
    return markSubmitted({ ...s, books }, id);
  }
  if (action.type === 'VOTE' && s.phase === 'bookVote') {
    const entry = s.books[s.bookIndex].entries[Number(action.choiceId)];
    if (!entry || entry.missing || entry.authorId === id) return s;
    return markSubmitted({ ...s, votes: { ...s.votes, [id]: String(Number(action.choiceId)) } }, id);
  }
  return s;
}

export function onTimerEnd(s: DoodleTelephoneState): DoodleTelephoneState {
  switch (s.phase) {
    case 'intro':
      return startLink(s, 0);
    case 'write':
    case 'draw':
    case 'describe':
      return startLink(fillMissing(s), s.link + 1);
    case 'showBook': {
      const book = s.books[s.bookIndex];
      if (s.revealIndex < book.entries.length) return goTo(s, 'showBook', display(TIMERS.show), { revealIndex: s.revealIndex + 1 });
      return goTo(s, 'bookVote', input(TIMERS.bookVote));
    }
    case 'bookVote':
      return scoreBook(s);
    case 'bookResult':
      return startBook(s, s.bookIndex + 1);
    default:
      return s;
  }
}

/** Voters who have at least one entry in this book they could vote for. */
function bookVoters(s: DoodleTelephoneState): string[] {
  const entries = s.books[s.bookIndex]?.entries ?? [];
  return ids(s).filter((id) => entries.some((e) => !e.missing && e.authorId !== id));
}

export function isStepComplete(s: DoodleTelephoneState): boolean {
  if (['write', 'draw', 'describe'].includes(s.phase)) return allConnectedSubmitted(s, ids(s));
  if (s.phase === 'bookVote') return allConnectedSubmitted(s, bookVoters(s));
  return false;
}

export interface DoodleTelephonePublic {
  link: number;
  chainLength: number;
  bookIndex: number;
  bookCount: number;
  book: { ownerId: string; entries: Entry[] } | null;
  votes: Record<string, string> | null;
  audience: string | null;
  points: Record<string, number> | null;
}

export function publicView(s: DoodleTelephoneState): DoodleTelephonePublic {
  const book = s.books[s.bookIndex];
  const revealing = ['showBook', 'bookVote', 'bookResult'].includes(s.phase) && book;
  return {
    link: s.link,
    chainLength: s.chainLength,
    bookIndex: s.bookIndex,
    bookCount: s.books.length,
    book: revealing ? { ownerId: book.ownerId, entries: s.phase === 'showBook' ? book.entries.slice(0, s.revealIndex) : book.entries } : null,
    votes: s.phase === 'bookResult' ? s.votes : null,
    audience: s.phase === 'bookResult' ? s.audienceChoice : null,
    points: s.phase === 'bookResult' ? s.lastPoints : null,
  };
}

export type DoodleTelephonePrivate =
  | { kind: 'write'; suggestion: string; done: boolean }
  | { kind: 'draw' | 'describe'; source: { kind: Entry['kind']; content: string }; done: boolean }
  | { kind: 'vote'; ownEntries: number[]; voted: string | null };

export function privateView(s: DoodleTelephoneState, playerId: string): DoodleTelephonePrivate | null {
  const done = s.submitted.includes(playerId);
  if (s.phase === 'write') return { kind: 'write', suggestion: s.suggestions[playerId] ?? '', done };
  if (s.phase === 'draw' || s.phase === 'describe') {
    const book = s.books[bookFor(s, playerId)];
    const source = sourceEntry(book) ?? { kind: 'text' as const, content: s.houseSentences[0] ?? FALLBACK_SENTENCES[0] };
    return { kind: s.phase, source: { kind: source.kind, content: source.content }, done };
  }
  if (s.phase === 'bookVote') {
    const entries = s.books[s.bookIndex].entries;
    return {
      kind: 'vote',
      ownEntries: entries.map((e, i) => (e.authorId === playerId ? i : -1)).filter((i) => i >= 0),
      voted: s.votes[playerId] ?? null,
    };
  }
  return null;
}

export function audienceVote(s: DoodleTelephoneState): AudienceVote | null {
  if (s.phase !== 'bookVote') return null;
  const entries = s.books[s.bookIndex].entries;
  return {
    prompt: 'Vote for the best link in this chain',
    options: entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !e.missing)
      .map(({ e, i }) => ({ id: String(i), label: e.kind === 'text' ? `Step ${i + 1}: ${e.content}` : `Step ${i + 1}: drawing` })),
  };
}

export function isOver(s: DoodleTelephoneState): boolean {
  return s.phase === 'done';
}
