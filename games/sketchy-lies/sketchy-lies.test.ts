import { describe, expect, it } from 'vitest';
import { drawingUrl, loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { sketchyLies } from './index';
import * as logic from './logic';

const content = loadPacks(['sketchy-lies']);

function bot(s: logic.SketchyLiesState, id: string) {
  const mine = logic.privateView(s, id);
  if (!mine || s.submitted.includes(id)) return null;
  if (mine.kind === 'draw') return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { url: drawingUrl(id) } };
  if (mine.kind === 'lie' && !mine.artist) return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { text: `lie ${id.slice(-1)}` } };
  if (mine.kind === 'pick' && !mine.artist) {
    const option = s.options.find((o) => !mine.ownOptionIds.includes(o.id))!;
    return { type: 'VOTE' as const, playerId: id, round: r(s), choiceId: option.id };
  }
  return null;
}

function toPick(n: number, seed: number) {
  let s = logic.onTimerEnd(logic.init(makePlayers(n), SETTINGS, content, seed));
  for (const p of s.players) s = logic.onAction(s, { type: 'SUBMIT', playerId: p.id, round: r(s), payload: { url: drawingUrl(p.id) } });
  s = logic.onTimerEnd(s); // lie
  return s;
}

describe('Sketchy Lies', () => {
  it('rejects lies that match the real title', () => {
    const s = toPick(4, 1);
    const truth = s.drawings[s.current].prompt;
    const liar = s.players.find((p) => p.id !== s.drawings[s.current].artistId)!.id;
    const next = logic.onAction(s, { type: 'SUBMIT', playerId: liar, round: r(s), payload: { text: truth.toUpperCase() } });
    expect(next.errors[liar]?.text).toMatch(/too close/);
    expect(next.lies[liar]).toBeUndefined();
  });

  it('always adds 2 House decoys with 2-3 players so there are at least 4 options', () => {
    let s = toPick(2, 2);
    const liar = s.players.find((p) => p.id !== s.drawings[s.current].artistId)!.id;
    s = logic.onAction(s, { type: 'SUBMIT', playerId: liar, round: r(s), payload: { text: 'a fake title' } });
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('pick');
    expect(s.options.filter((o) => o.kind === 'house')).toHaveLength(2);
    expect(s.options.length).toBeGreaterThanOrEqual(4);
  });

  it('pays the truth-finder, the artist, and the liar who fooled someone', () => {
    let s = toPick(3, 3);
    const artist = s.drawings[s.current].artistId;
    const [a, b] = s.players.map((p) => p.id).filter((id) => id !== artist);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { text: 'my clever lie' } });
    s = logic.onAction(s, { type: 'SUBMIT', playerId: b, round: r(s), payload: { text: 'another fib' } });
    s = logic.onTimerEnd(s);
    const truth = s.options.find((o) => o.kind === 'truth')!;
    const aLie = s.options.find((o) => o.authors.includes(a))!;
    s = logic.onAction(s, { type: 'VOTE', playerId: a, round: r(s), choiceId: truth.id });
    s = logic.onAction(s, { type: 'VOTE', playerId: b, round: r(s), choiceId: aLie.id });
    s = logic.onTimerEnd(s);
    expect(s.scores[a]).toBe(1500);
    expect(s.scores[artist]).toBe(500);
    expect(s.scores[b]).toBe(0);
  });

  it('hides the true title in the public view until the reveal', () => {
    play(sketchyLies, logic.init(makePlayers(4), SETTINGS, content, 4), bot, {
      onStep: (s) => {
        if (s.phase === 'lie' || s.phase === 'pick') {
          const view = logic.publicView(s);
          expect(view.reveal).toBeNull();
          if (s.phase === 'lie') expect(JSON.stringify(view)).not.toContain(s.drawings[s.current].prompt);
        }
      },
    });
  });

  it('plays two drawing rounds with 3 players and one with 6', () => {
    for (const [n, rounds] of [
      [3, 2],
      [6, 1],
    ]) {
      let maxRound = 0;
      const end = play(sketchyLies, logic.init(makePlayers(n), SETTINGS, content, n), bot, { onStep: (s) => (maxRound = Math.max(maxRound, s.round)) });
      expect(end.phase).toBe('done');
      expect(maxRound).toBe(rounds);
    }
  });
});
