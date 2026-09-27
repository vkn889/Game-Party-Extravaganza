import { describe, expect, it } from 'vitest';
import { HOUSE_ID } from '@/lib/engine/house';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { punchline } from './index';
import * as logic from './logic';

const content = loadPacks(['punchline']);

function answerBot(s: logic.PunchlineState, id: string) {
  const mine = logic.privateView(s, id);
  if (mine?.kind === 'answer') {
    const task = mine.tasks.find((t) => !t.answered);
    if (task) return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { matchupId: task.matchupId, text: `answer from ${id.slice(-1)}` } };
  }
  if (mine?.kind === 'vote' && mine.canVote && !mine.votedFor) {
    const m = s.matchups[s.current];
    const choice = m.answers.find((a) => a.id !== mine.ownAnswerId && !a.missing);
    if (choice) return { type: 'VOTE' as const, playerId: id, round: r(s), choiceId: choice.id };
  }
  return null;
}

describe('Punchline', () => {
  it('uses duels with 4+ players and the House with 2-3', () => {
    expect(logic.init(makePlayers(4), SETTINGS, content, 1).mode).toBe('duel');
    expect(logic.init(makePlayers(3), SETTINGS, content, 1).mode).toBe('house');
    expect(logic.init(makePlayers(2), SETTINGS, content, 1).mode).toBe('house');
  });

  it('gives each player exactly two prompts in a duel round, shared with one rival', () => {
    let s = logic.init(makePlayers(5), SETTINGS, content, 7);
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('answer');
    expect(s.matchups).toHaveLength(5);
    for (const p of s.players) expect(s.matchups.filter((m) => m.playerIds.includes(p.id))).toHaveLength(2);
    for (const m of s.matchups) expect(new Set(m.playerIds).size).toBe(2);
  });

  it('plays to the end with 2, 3, 4 and 8 players', () => {
    for (const n of [2, 3, 4, 8]) {
      const end = play(punchline, logic.init(makePlayers(n), SETTINGS, content, n), answerBot);
      expect(end.phase).toBe('done');
      expect(Object.values(end.scores).some((v) => v > 0)).toBe(true);
    }
  });

  it('plays to the end on timeouts alone (safe defaults)', () => {
    const end = play(punchline, logic.init(makePlayers(4), SETTINGS, content, 3), null);
    expect(end.phase).toBe('done');
    expect(Object.values(end.scores).every((v) => v === 0)).toBe(true);
  });

  it('adds a House answer in small groups and blocks voting for your own answer', () => {
    let s = logic.init(makePlayers(2), SETTINGS, content, 11);
    s = logic.onTimerEnd(s);
    const [a, b] = s.players.map((p) => p.id);
    for (const id of [a, b]) {
      for (const m of s.matchups) s = logic.onAction(s, { type: 'SUBMIT', playerId: id, round: r(s), payload: { matchupId: m.id, text: `x ${id}` } });
    }
    expect(logic.isStepComplete(s)).toBe(true);
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('vote');
    const m = s.matchups[0];
    expect(m.answers.some((x) => x.authorId === HOUSE_ID)).toBe(true);
    const own = m.answers.find((x) => x.authorId === a)!;
    const blocked = logic.onAction(s, { type: 'VOTE', playerId: a, round: r(s), choiceId: own.id });
    expect(blocked).toBe(s);
  });

  it('scores for beating the House', () => {
    let s = logic.init(makePlayers(2), SETTINGS, content, 5);
    s = logic.onTimerEnd(s);
    const [a, b] = s.players.map((p) => p.id);
    for (const id of [a, b]) {
      for (const m of s.matchups) s = logic.onAction(s, { type: 'SUBMIT', playerId: id, round: r(s), payload: { matchupId: m.id, text: `x ${id}` } });
    }
    s = logic.onTimerEnd(s);
    const m = s.matchups[0];
    const aAnswer = m.answers.find((x) => x.authorId === a)!;
    const house = m.answers.find((x) => x.authorId === HOUSE_ID)!;
    s = logic.onAction(s, { type: 'VOTE', playerId: b, round: r(s), choiceId: aAnswer.id });
    s = logic.onAction(s, { type: 'VOTE', playerId: a, round: r(s), choiceId: house.id });
    s = logic.onTimerEnd(s);
    // a gets 1 vote (500); tying the House's 1 vote earns no beat-the-House bonus.
    expect(s.scores[a]).toBe(500);
    expect(s.scores[b]).toBe(0);
  });

  it('never reveals authors in the public view before the reveal', () => {
    const secrets: string[] = [];
    play(punchline, logic.init(makePlayers(4), SETTINGS, content, 9), answerBot, {
      onStep: (s) => {
        if (s.phase === 'vote') {
          const view = logic.publicView(s);
          const json = JSON.stringify(view);
          for (const p of s.players) if (json.includes(p.id) && !view.matchup?.answerers.includes(p.id)) secrets.push(p.id);
        }
      },
    });
    expect(secrets).toEqual([]);
  });

  it('rejects stale actions from a different matchup and duplicate answers', () => {
    let s = logic.init(makePlayers(4), SETTINGS, content, 2);
    s = logic.onTimerEnd(s);
    const id = s.players[0].id;
    const mine = s.matchups.find((m) => m.playerIds.includes(id))!;
    const other = s.matchups.find((m) => !m.playerIds.includes(id))!;
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: id, round: r(s), payload: { matchupId: other.id, text: 'hi' } })).toBe(s);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: id, round: r(s), payload: { matchupId: mine.id, text: 'hi' } });
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: id, round: r(s), payload: { matchupId: mine.id, text: 'again' } })).toBe(s);
  });
});
