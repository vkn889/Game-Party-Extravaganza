import { describe, expect, it } from 'vitest';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { buzzerBlitz } from './index';
import * as logic from './logic';

const content = loadPacks(['buzzer-blitz']);
const start = (n: number, seed: number) => logic.onTimerEnd(logic.init(makePlayers(n), SETTINGS, content, seed));

describe('Buzzer Blitz', () => {
  it('gives the question to the first buzz and drops later buzzes as stale', () => {
    let s = start(3, 1);
    const [a, b] = s.players.map((p) => p.id);
    const step = r(s);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: step, payload: { buzz: true } });
    expect(s.phase).toBe('answer');
    expect(s.buzzer).toBe(a);
    // The engine rejects b's buzz because it quotes the old step; logic ignores it in this phase too.
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: b, round: step, payload: { buzz: true } })).toBe(s);
  });

  it('scores a correct answer and locks out a wrong one', () => {
    let s = start(3, 2);
    const [a, b] = s.players.map((p) => p.id);
    const q = s.questions[0];
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { buzz: true } });
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { choice: (q.correct + 1) % 4 } });
    expect(s.phase).toBe('buzz');
    expect(s.locked).toEqual([a]);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { buzz: true } })).toBe(s);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: b, round: r(s), payload: { buzz: true } });
    s = logic.onAction(s, { type: 'SUBMIT', playerId: b, round: r(s), payload: { choice: q.correct } });
    expect(s.phase).toBe('reveal');
    expect(s.scores[b]).toBe(logic.POINTS);
    expect(s.scores[a]).toBe(0);
  });

  it('reveals once everyone is locked out', () => {
    let s = start(2, 3);
    const q = s.questions[0];
    for (const p of s.players) {
      s = logic.onAction(s, { type: 'SUBMIT', playerId: p.id, round: r(s), payload: { buzz: true } });
      s = logic.onAction(s, { type: 'SUBMIT', playerId: p.id, round: r(s), payload: { choice: (q.correct + 1) % 4 } });
    }
    expect(s.phase).toBe('reveal');
    expect(logic.publicView(s)?.correct).toBe(q.correct);
  });

  it('plays 10 questions and hides the answer until the reveal', () => {
    const end = play(buzzerBlitz, logic.init(makePlayers(4), SETTINGS, content, 4), (s, id) => {
      if (s.phase === 'buzz' && id === s.players[s.qIndex % 4].id) return { type: 'SUBMIT', playerId: id, round: r(s), payload: { buzz: true } };
      if (s.phase === 'answer' && id === s.buzzer) return { type: 'SUBMIT', playerId: id, round: r(s), payload: { choice: s.questions[s.qIndex].correct } };
      return null;
    }, { onStep: (s) => { if (s.phase === 'buzz' || s.phase === 'answer') expect(logic.publicView(s)?.correct).toBeNull(); } });
    expect(end.phase).toBe('done');
    expect(Object.values(end.scores).reduce((a, b) => a + b, 0)).toBe(logic.QUESTIONS * logic.POINTS);
  });
});
