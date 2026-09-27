import { describe, expect, it } from 'vitest';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { twoTruths } from './index';
import * as logic from './logic';

const content = loadPacks(['two-truths']);

function written(n: number, seed: number) {
  let s = logic.onTimerEnd(logic.init(makePlayers(n), SETTINGS, content, seed));
  for (const p of s.players) {
    s = logic.onAction(s, { type: 'SUBMIT', playerId: p.id, round: r(s), payload: { truths: [`${p.name} true 1`, `${p.name} true 2`], lie: `${p.name} lie` } });
  }
  return s;
}

describe('Two Truths and a Lie', () => {
  it('requires two truths and a lie', () => {
    const s = logic.onTimerEnd(logic.init(makePlayers(2), SETTINGS, content, 1));
    const id = s.players[0].id;
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: id, round: r(s), payload: { truths: ['only one'], lie: 'x' } })).toBe(s);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: id, round: r(s), payload: { truths: ['a', ''], lie: 'x' } })).toBe(s);
  });

  it('with 2 players the other player guesses, and scores go both ways', () => {
    let s = written(2, 2);
    expect(logic.isStepComplete(s)).toBe(true);
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('guess');
    const author = logic.authorOf(s);
    const guesser = s.players.find((p) => p.id !== author)!.id;
    expect(logic.onAction(s, { type: 'VOTE', playerId: author, round: r(s), choiceId: 's0' })).toBe(s);
    const wrong = s.options.find((o) => !o.isLie)!;
    s = logic.onAction(s, { type: 'VOTE', playerId: guesser, round: r(s), choiceId: wrong.id });
    s = logic.onTimerEnd(s);
    expect(s.scores[author]).toBe(300);
    expect(s.scores[guesser]).toBe(0);
  });

  it('never reveals which statement is the lie before the reveal', () => {
    play(twoTruths, written(4, 3), null, {
      onStep: (s) => {
        if (s.phase === 'guess') {
          const view = logic.publicView(s)!;
          expect(view.reveal).toBeNull();
          expect(JSON.stringify(view)).not.toContain('isLie');
        }
      },
    });
  });

  it('gives everyone who wrote a turn and ends', () => {
    let authors = 0;
    const end = play(twoTruths, written(5, 4), null, { onStep: (s) => (authors = s.queue.length) });
    expect(end.phase).toBe('done');
    expect(authors).toBe(5);
  });
});
