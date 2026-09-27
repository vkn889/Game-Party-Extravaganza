import { describe, expect, it } from 'vitest';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { mostLikelyTo } from './index';
import * as logic from './logic';

const content = loadPacks(['most-likely-to']);

describe('Most Likely To', () => {
  it('scores voters who match the majority (4+ players)', () => {
    let s = logic.onTimerEnd(logic.init(makePlayers(4), SETTINGS, content, 1));
    const [a, b, c, d] = s.players.map((p) => p.id);
    s = logic.onAction(s, { type: 'VOTE', playerId: a, round: r(s), choiceId: c });
    s = logic.onAction(s, { type: 'VOTE', playerId: b, round: r(s), choiceId: c });
    s = logic.onAction(s, { type: 'VOTE', playerId: c, round: r(s), choiceId: d });
    s = logic.onAction(s, { type: 'VOTE', playerId: d, round: r(s), choiceId: d });
    s = logic.onAction(s, { type: 'AUDIENCE_VOTE', choiceId: c });
    s = logic.onTimerEnd(s);
    expect(s.top).toEqual([c]);
    expect(s.scores).toMatchObject({ [a]: 500, [b]: 500, [c]: 0, [d]: 0 });
  });

  it('becomes "me or you?" with 2 players: both score when they agree', () => {
    let s = logic.onTimerEnd(logic.init(makePlayers(2), SETTINGS, content, 2));
    expect(s.mode).toBe('meOrYou');
    const [a, b] = s.players.map((p) => p.id);
    s = logic.onAction(s, { type: 'VOTE', playerId: a, round: r(s), choiceId: a });
    s = logic.onAction(s, { type: 'VOTE', playerId: b, round: r(s), choiceId: a });
    s = logic.onTimerEnd(s);
    expect(s.scores).toEqual({ [a]: 500, [b]: 500 });
  });

  it('keeps votes anonymous until the reveal and plays 10 prompts', () => {
    const end = play(mostLikelyTo, logic.init(makePlayers(6), SETTINGS, content, 3), (s, id) =>
      s.phase === 'vote' && !s.submitted.includes(id) ? { type: 'VOTE', playerId: id, round: r(s), choiceId: s.players[0].id } : null,
    { onStep: (s) => { if (s.phase === 'vote') expect(logic.publicView(s)?.reveal).toBeNull(); } });
    expect(end.phase).toBe('done');
    expect(end.pIndex).toBe(logic.PROMPTS - 1);
  });
});
