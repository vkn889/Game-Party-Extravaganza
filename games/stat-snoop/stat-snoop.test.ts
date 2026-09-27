import { describe, expect, it } from 'vitest';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { statSnoop } from './index';
import * as logic from './logic';

const content = loadPacks(['stat-snoop']);

describe('Stat Snoop', () => {
  it('rotates the guesser so everyone guesses, and swaps each question with 2 players', () => {
    const s = logic.init(makePlayers(2), SETTINGS, content, 1);
    expect(s.questions).toHaveLength(6);
    expect(s.order[0]).not.toBe(s.order[1]);
    expect(new Set(s.order).size).toBe(2);
    const big = logic.init(makePlayers(6), SETTINGS, content, 1);
    expect(new Set(big.order).size).toBe(6);
  });

  it('scores the guesser by closeness and bettors by direction', () => {
    expect(logic.guesserPoints(40, 40)).toBe(1500);
    expect(logic.guesserPoints(40, 45)).toBe(800);
    expect(logic.guesserPoints(0, 100)).toBe(0);
    expect(logic.betWins('higher', 40, 50)).toBe(true);
    expect(logic.betWins('muchHigher', 40, 50)).toBe(false);
    expect(logic.betWins('muchHigher', 40, 56)).toBe(true);
    expect(logic.betWins('lower', 40, 40)).toBe(false);
    expect(logic.betWins('muchLower', 40, 20)).toBe(true);
  });

  it('only the guesser can guess and only bettors can bet', () => {
    let s = logic.init(makePlayers(3), SETTINGS, content, 2);
    s = logic.onTimerEnd(s);
    const guesser = s.order[0];
    const other = s.players.find((p) => p.id !== guesser)!.id;
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: other, round: r(s), payload: { value: 10 } })).toBe(s);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: guesser, round: r(s), payload: { value: 140 } });
    expect(s.guess).toBe(100);
    expect(logic.isStepComplete(s)).toBe(true);
    s = logic.onTimerEnd(s);
    expect(logic.onAction(s, { type: 'VOTE', playerId: guesser, round: r(s), choiceId: 'higher' })).toBe(s);
    s = logic.onAction(s, { type: 'VOTE', playerId: other, round: r(s), choiceId: 'lower' });
    expect(s.bets[other]).toBe('lower');
  });

  it('defaults an absent guess to 50% and plays to the end', () => {
    let s = logic.init(makePlayers(4), SETTINGS, content, 3);
    s = logic.onTimerEnd(s);
    s = logic.onTimerEnd(s);
    expect(s.guess).toBe(50);
    const end = play(statSnoop, logic.init(makePlayers(8), SETTINGS, content, 3), (st, id) => {
      if (st.phase === 'guess' && st.order[st.qIndex] === id && !st.submitted.includes(id)) return { type: 'SUBMIT', playerId: id, round: r(st), payload: { value: 30 } };
      if (st.phase === 'bet' && st.order[st.qIndex] !== id && !st.submitted.includes(id)) return { type: 'VOTE', playerId: id, round: r(st), choiceId: 'higher' };
      return null;
    });
    expect(end.phase).toBe('done');
  });

  it('keeps the answer out of the public view until the reveal', () => {
    let s = logic.init(makePlayers(3), SETTINGS, content, 4);
    s = logic.onTimerEnd(s);
    expect(logic.publicView(s)?.answer).toBeNull();
    s = logic.onTimerEnd(s);
    expect(logic.publicView(s)?.answer).toBeNull();
    s = logic.onTimerEnd(s);
    expect(logic.publicView(s)?.answer).toBe(s.questions[0].answer);
  });
});
