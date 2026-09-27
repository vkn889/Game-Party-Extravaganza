import { describe, expect, it } from 'vitest';
import { isFuzzyMatch } from '@/lib/engine/text';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { emojiDecode } from './index';
import * as logic from './logic';

const content = loadPacks(['emoji-decode']);

describe('Emoji Decode', () => {
  it('accepts small typos, alternatives and missing articles', () => {
    let s = logic.onTimerEnd(logic.init(makePlayers(3), SETTINGS, content, 1));
    s = { ...s, puzzles: [{ emojis: '🦁👑', answer: 'The Lion King|Lion King', category: 'Movie' }, ...s.puzzles.slice(1)] };
    const [a, b, c] = s.players.map((p) => p.id);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { guess: 'lion kng' } });
    s = logic.onAction(s, { type: 'SUBMIT', playerId: b, round: r(s), payload: { guess: 'THE LION KING!' } });
    s = logic.onAction(s, { type: 'SUBMIT', playerId: c, round: r(s), payload: { guess: 'tiger queen' } });
    expect(s.solved).toEqual([a, b]);
    expect(s.scores[a]).toBe(logic.ORDER_POINTS[0]);
    expect(s.scores[b]).toBe(logic.ORDER_POINTS[1]);
    expect(s.feedback[c].text).toMatch(/Not quite/);
  });

  it('masks the answer until the reveal', () => {
    expect(logic.mask('The Lion King')).toBe('___ ____ ____');
    let s = logic.onTimerEnd(logic.init(makePlayers(2), SETTINGS, content, 2));
    expect(logic.publicView(s)?.answer).toBeNull();
    expect(JSON.stringify(logic.publicView(s))).not.toContain(logic.displayAnswer(s.puzzles[0]));
    s = logic.onTimerEnd(s);
    expect(logic.publicView(s)?.answer).toBe(logic.displayAnswer(s.puzzles[0]));
  });

  it('every puzzle answer fuzzy-matches itself and plays 10 puzzles', () => {
    for (const item of content['emoji-decode']) {
      for (const alt of item.answer!.split('|')) expect(isFuzzyMatch(alt, item.answer!)).toBe(true);
    }
    const end = play(emojiDecode, logic.init(makePlayers(8), SETTINGS, content, 3), (s, id) =>
      s.phase === 'guess' && !s.solved.includes(id) ? { type: 'SUBMIT', playerId: id, round: r(s), payload: { guess: logic.displayAnswer(s.puzzles[s.pIndex]) } } : null,
    );
    expect(end.phase).toBe('done');
    expect(end.pIndex).toBe(logic.PUZZLES - 1);
  });
});
