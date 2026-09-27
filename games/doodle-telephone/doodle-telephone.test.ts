import { describe, expect, it } from 'vitest';
import { HOUSE_ID } from '@/lib/engine/house';
import { drawingUrl, loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { doodleTelephone } from './index';
import * as logic from './logic';

const content = loadPacks(['doodle-telephone']);

function bot(s: logic.DoodleTelephoneState, id: string) {
  const mine = logic.privateView(s, id);
  if (!mine || s.submitted.includes(id)) return null;
  if (mine.kind === 'write' || mine.kind === 'describe') return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { text: `text by ${id.slice(-1)}` } };
  if (mine.kind === 'draw') return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { url: drawingUrl(id) } };
  if (mine.kind === 'vote' && !mine.voted) {
    const entries = s.books[s.bookIndex].entries;
    const i = entries.findIndex((e, idx) => !e.missing && !mine.ownEntries.includes(idx));
    if (i >= 0) return { type: 'VOTE' as const, playerId: id, round: r(s), choiceId: String(i) };
  }
  return null;
}

describe('Doodle Telephone', () => {
  it('loops twice around small groups so every book has at least 4 steps', () => {
    expect(logic.chainLengthFor(2)).toBe(4);
    expect(logic.chainLengthFor(3)).toBe(6);
    expect(logic.chainLengthFor(5)).toBe(5);
    let books: logic.Book[] = [];
    play(doodleTelephone, logic.init(makePlayers(2), SETTINGS, content, 1), bot, { onStep: (s) => (books = s.books) });
    for (const b of books) expect(b.entries.length).toBe(4);
  });

  it('passes each book to a different player every step, alternating text and drawings', () => {
    let s = logic.init(makePlayers(4), SETTINGS, content, 2);
    s = play(doodleTelephone, s, bot, { maxSteps: 5 });
    for (const book of s.books) {
      const authors = book.entries.map((e) => e.authorId);
      expect(new Set(authors).size).toBe(authors.length);
      book.entries.forEach((e, i) => expect(e.kind).toBe(logic.kindForLink(i)));
    }
  });

  it('uses a House sentence when someone does not write, and skips missing links', () => {
    let s = logic.onTimerEnd(logic.init(makePlayers(3), SETTINGS, content, 3));
    s = logic.onTimerEnd(s);
    for (const b of s.books) expect(b.entries[0].authorId).toBe(HOUSE_ID);
    s = logic.onTimerEnd(s); // nobody drew
    expect(s.books.every((b) => b.entries[1].missing)).toBe(true);
    const view = logic.privateView(s, s.players[0].id);
    expect(view && 'source' in view && view.source.kind).toBe('text');
  });

  it('reveals each book, lets players vote for links, and ends', () => {
    const end = play(doodleTelephone, logic.init(makePlayers(5), SETTINGS, content, 4), bot);
    expect(end.phase).toBe('done');
    expect(Object.values(end.scores).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});
