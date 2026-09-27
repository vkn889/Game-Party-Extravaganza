import { describe, expect, it } from 'vitest';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { killerQuiz } from './index';
import * as logic from './logic';

const content = loadPacks(['killer-quiz', 'killer-quiz-finale']);

/** Answers wrong on purpose (index of a wrong option) when `wrong` is true. */
function bot(wrong: boolean) {
  return (s: logic.KillerQuizState, id: string) => {
    if (s.submitted.includes(id)) return null;
    if (s.phase === 'question') {
      const q = s.questions[s.qIndex];
      const choice = wrong ? (q.correct + 1) % q.options.length : q.correct;
      return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { choice } };
    }
    if (s.phase === 'dice' && s.atRisk.includes(id)) return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { picks: [1, 2, 3] } };
    if (s.phase === 'finale') {
      const item = s.finale[s.finaleIndex];
      const picks = item.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { picks } };
    }
    return null;
  };
}

describe('Killer Quiz', () => {
  it('builds 8 four-option questions with the answer among the options', () => {
    const s = logic.init(makePlayers(3), SETTINGS, content, 1);
    expect(s.questions).toHaveLength(8);
    for (const q of s.questions) {
      expect(q.options).toHaveLength(4);
      expect(q.correct).toBeGreaterThanOrEqual(0);
    }
  });

  it('plays to the end with 2 and 8 players and crowns someone', () => {
    for (const n of [2, 8]) {
      const end = play(killerQuiz, logic.init(makePlayers(n), SETTINGS, content, n), bot(false));
      expect(end.phase).toBe('done');
      expect(logic.winners(end).length).toBeGreaterThan(0);
    }
  });

  it('sends wrong answers to a death minigame and turns losers into ghosts', () => {
    let s = logic.init(makePlayers(2), SETTINGS, content, 4);
    s = logic.onTimerEnd(s); // question 1
    const [a, b] = s.players.map((p) => p.id);
    const q = s.questions[0];
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { choice: q.correct } });
    s = logic.onAction(s, { type: 'SUBMIT', playerId: b, round: r(s), payload: { choice: (q.correct + 1) % 4 } });
    expect(logic.isStepComplete(s)).toBe(true);
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('questionReveal');
    expect(s.atRisk).toEqual([b]);
    expect(s.scores[a]).toBe(1000);
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('deathIntro');
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('dice');
    // Only the at-risk player may act.
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { picks: [1, 2, 3] } })).toBe(s);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: b, round: r(s), payload: { picks: [1, 2, 3] } });
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('deathReveal');
    const roll = s.minigame?.kind === 'dice' ? s.minigame.roll! : 0;
    expect(s.alive[b]).toBe([1, 2, 3].includes(roll));
  });

  it('treats a disconnected player as safe rather than wrong', () => {
    let s = logic.init(makePlayers(3), SETTINGS, content, 8);
    s = logic.onTimerEnd(s);
    const gone = s.players[2].id;
    s = { ...s, connected: s.connected.filter((id) => id !== gone) };
    s = logic.onTimerEnd(s);
    expect(s.results[gone]).toBeNull();
    expect(s.atRisk).not.toContain(gone);
  });

  it('lets ghosts win the finale race', () => {
    let s = logic.init(makePlayers(2), SETTINGS, content, 2);
    const [a, b] = s.players.map((p) => p.id);
    s = { ...s, alive: { [a]: true, [b]: false }, qIndex: logic.QUESTIONS - 1, phase: 'deathReveal' };
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('finaleIntro');
    expect(s.positions).toEqual({ [a]: logic.ALIVE_START, [b]: 0 });
    s = play(killerQuiz, s, (st, id) => {
      if (st.phase !== 'finale' || st.submitted.includes(id)) return null;
      const item = st.finale[st.finaleIndex];
      const picks = id === b ? item.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0) : [];
      return { type: 'SUBMIT', playerId: id, round: r(st), payload: { picks } };
    });
    expect(logic.winners(s)).toEqual([b]);
    expect(s.scores[b]).toBeGreaterThan(s.scores[a]);
  });

  it('hides the correct answer and the memory sequence when they must stay secret', () => {
    let s = logic.init(makePlayers(3), SETTINGS, content, 3);
    s = logic.onTimerEnd(s);
    expect(logic.publicView(s).question?.correct).toBeNull();
    s = { ...s, minigame: { kind: 'memory', sequence: [1, 2, 3, 4, 5], guesses: {} }, phase: 'memoryInput', atRisk: [s.players[0].id] };
    expect(logic.publicView(s).minigame?.sequence).toBeUndefined();
  });

  it('plays to the end on timeouts alone', () => {
    const end = play(killerQuiz, logic.init(makePlayers(4), SETTINGS, content, 6), null);
    expect(end.phase).toBe('done');
  });
});
