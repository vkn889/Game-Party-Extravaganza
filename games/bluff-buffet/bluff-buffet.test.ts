import { describe, expect, it } from 'vitest';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { bluffBuffet } from './index';
import * as logic from './logic';

const content = loadPacks(['bluff-buffet']);

describe('Bluff Buffet', () => {
  it('fills the options to at least 4 with House lies', () => {
    let s = logic.onTimerEnd(logic.init(makePlayers(2), SETTINGS, content, 1));
    const [a] = s.players.map((p) => p.id);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { text: 'a clever lie' } });
    s = logic.onTimerEnd(s);
    expect(s.options.length).toBeGreaterThanOrEqual(4);
    expect(s.options.filter((o) => o.kind === 'truth')).toHaveLength(1);
  });

  it('rejects a "lie" that is really the truth', () => {
    const s = logic.onTimerEnd(logic.init(makePlayers(3), SETTINGS, content, 2));
    const id = s.players[0].id;
    const next = logic.onAction(s, { type: 'SUBMIT', playerId: id, round: r(s), payload: { text: s.facts[0].answer } });
    expect(next.errors[id]?.text).toMatch(/truth/);
    expect(next.submitted).not.toContain(id);
  });

  it('merges identical lies and pays both liars, with multipliers in later rounds', () => {
    // Jump to the reveal of fact 3 so the next fact is the first 2x one.
    let s = logic.onTimerEnd({ ...logic.init(makePlayers(3), SETTINGS, content, 3), phase: 'reveal', qIndex: 2 });
    expect(logic.multiplier(s.qIndex)).toBe(2);
    const [a, b, c] = s.players.map((p) => p.id);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { text: 'Same Lie' } });
    s = logic.onAction(s, { type: 'SUBMIT', playerId: b, round: r(s), payload: { text: 'same lie!' } });
    s = logic.onAction(s, { type: 'SUBMIT', playerId: c, round: r(s), payload: { text: 'other' } });
    s = logic.onTimerEnd(s);
    const shared = s.options.find((o) => o.kind === 'lie' && o.authors.length === 2)!;
    expect(shared.authors.sort()).toEqual([a, b].sort());
    // a and b can't pick their own shared lie.
    expect(logic.onAction(s, { type: 'VOTE', playerId: a, round: r(s), choiceId: shared.id })).toBe(s);
    s = logic.onAction(s, { type: 'VOTE', playerId: c, round: r(s), choiceId: shared.id });
    s = logic.onTimerEnd(s);
    expect(s.scores[a]).toBe(1000);
    expect(s.scores[b]).toBe(1000);
  });

  it('plays 7 facts to the end and keeps the truth hidden until the reveal', () => {
    const end = play(
      bluffBuffet,
      logic.init(makePlayers(5), SETTINGS, content, 4),
      (s, id) => {
        if (s.submitted.includes(id)) return null;
        if (s.phase === 'lie') return { type: 'SUBMIT', playerId: id, round: r(s), payload: { text: `lie ${id.slice(-1)} ${s.qIndex}` } };
        if (s.phase === 'pick') {
          const o = s.options.find((x) => !x.authors.includes(id))!;
          return { type: 'VOTE', playerId: id, round: r(s), choiceId: o.id };
        }
        return null;
      },
      {
        onStep: (s) => {
          if (s.phase === 'lie') expect(JSON.stringify(logic.publicView(s))).not.toContain(`"${s.facts[s.qIndex].answer}"`);
          if (s.phase === 'pick') expect(logic.publicView(s)?.reveal).toBeNull();
        },
      },
    );
    expect(end.phase).toBe('done');
    expect(end.qIndex).toBe(logic.MULTIPLIERS.length - 1);
  });
});
