import { describe, expect, it } from 'vitest';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { handsUpHoax } from './index';
import * as logic from './logic';

const content = loadPacks(['hands-up-hoax']);

/** intro -> task -> act -> vote */
function toVote(s: logic.HandsUpHoaxState) {
  return logic.onTimerEnd(logic.onTimerEnd(logic.onTimerEnd(s)));
}

describe('Hands Up Hoax', () => {
  it('has exactly one faker in classic mode, who sees only the category', () => {
    let s = logic.init(makePlayers(5), SETTINGS, content, 1);
    expect(s.mode).toBe('classic');
    s = logic.onTimerEnd(s);
    expect(s.fakers).toHaveLength(1);
    const faker = s.fakers[0];
    const fakerView = logic.privateView(s, faker);
    expect(fakerView).toMatchObject({ kind: 'task', faker: true, task: null });
    const honest = s.players.find((p) => p.id !== faker)!.id;
    expect(logic.privateView(s, honest)).toMatchObject({ faker: false, task: s.tasks[0].text });
  });

  it('never puts the task or the faker in the public view before the reveal', () => {
    play(handsUpHoax, logic.init(makePlayers(4), SETTINGS, content, 2), null, {
      onStep: (s) => {
        if (s.phase !== 'reveal' && s.phase !== 'intro' && s.phase !== 'done') {
          const json = JSON.stringify(logic.publicView(s));
          expect(json).not.toContain(s.tasks[s.taskIndex].text);
          for (const f of s.fakers) expect(json).not.toContain(f);
        }
      },
    });
  });

  it('rewards correct votes and a faker who escapes', () => {
    let s = toVote(logic.init(makePlayers(4), SETTINGS, content, 3));
    expect(s.phase).toBe('vote');
    const faker = s.fakers[0];
    const honest = s.players.map((p) => p.id).filter((id) => id !== faker);
    s = logic.onAction(s, { type: 'VOTE', playerId: honest[0], round: r(s), choiceId: faker });
    s = logic.onAction(s, { type: 'VOTE', playerId: honest[1], round: r(s), choiceId: honest[2] });
    s = logic.onAction(s, { type: 'VOTE', playerId: honest[2], round: r(s), choiceId: honest[1] });
    s = logic.onAction(s, { type: 'VOTE', playerId: faker, round: r(s), choiceId: honest[0] });
    expect(logic.isStepComplete(s)).toBe(true);
    s = logic.onTimerEnd(s);
    expect(s.scores[honest[0]]).toBe(500);
    expect(s.scores[faker]).toBe(1000); // no clear accusation, so the faker escaped
  });

  it('uses maybe-faker mode with per-player guesses for 2 and 3 players', () => {
    for (const n of [2, 3]) {
      let s = logic.init(makePlayers(n), SETTINGS, content, n);
      expect(s.mode).toBe('maybe');
      s = toVote(s);
      expect(s.phase).toBe('vote');
      expect(s.fakers.length).toBeLessThanOrEqual(2);
      const [a] = s.players.map((p) => p.id);
      const others = s.players.map((p) => p.id).filter((id) => id !== a);
      const guesses = Object.fromEntries(others.map((id) => [id, s.fakers.includes(id)]));
      s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { guesses } });
      s = logic.onTimerEnd(s);
      expect(s.scores[a]).toBe(500 * others.length);
    }
  });

  it('plays 6 rounds to the end', () => {
    const end = play(handsUpHoax, logic.init(makePlayers(8), SETTINGS, content, 9), (s, id) =>
      s.phase === 'vote' && !s.submitted.includes(id) ? { type: 'VOTE', playerId: id, round: r(s), choiceId: s.players.find((p) => p.id !== id)!.id } : null,
    );
    expect(end.phase).toBe('done');
    expect(end.taskIndex).toBe(logic.ROUNDS - 1);
  });
});
