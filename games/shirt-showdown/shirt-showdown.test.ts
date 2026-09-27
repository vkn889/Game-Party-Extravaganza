import { describe, expect, it } from 'vitest';
import { HOUSE_ID } from '@/lib/engine/house';
import { drawingUrl, loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { shirtShowdown } from './index';
import * as logic from './logic';

const content = loadPacks(['shirt-showdown']);

function bot(s: logic.ShirtShowdownState, id: string) {
  const mine = logic.privateView(s, id);
  if (!mine || s.submitted.includes(id)) return null;
  if (mine.kind === 'draw') return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { url: drawingUrl(id) } };
  if (mine.kind === 'slogan') return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { text: `slogan ${mine.done}` } };
  if (mine.kind === 'build') {
    const d = mine.drawings.find((x) => !mine.built.some((b) => b.drawingId === x.id))!;
    const t = mine.slogans.find((x) => !mine.built.some((b) => b.sloganId === x.id))!;
    return { type: 'SUBMIT' as const, playerId: id, round: r(s), payload: { drawingId: d.id, sloganId: t.id } };
  }
  if (mine.kind === 'battle' && mine.canVote && !mine.voted) {
    return { type: 'VOTE' as const, playerId: id, round: r(s), choiceId: s.battles[s.current].left };
  }
  return null;
}

describe('Shirt Showdown', () => {
  it('runs a bracket down to one champion with 5 players', () => {
    let champion: string | null = null;
    const end = play(shirtShowdown, logic.init(makePlayers(5), SETTINGS, content, 1), bot, {
      onStep: (s) => {
        if (s.phase === 'champion') champion = s.champion;
      },
    });
    expect(end.phase).toBe('done');
    expect(champion).not.toBeNull();
  });

  it('pits each of 2 shirts per player against a House remix in small groups', () => {
    let seen: logic.ShirtShowdownState | null = null;
    play(shirtShowdown, logic.init(makePlayers(2), SETTINGS, content, 2), bot, {
      onStep: (s) => {
        if (s.phase === 'battle' && !seen) seen = s;
      },
    });
    const s = seen!;
    expect(s.battles).toHaveLength(4);
    for (const b of s.battles) {
      const builders = [b.left, b.right].map((id) => s.shirts.find((x) => x.id === id)!.builderId);
      expect(builders).toContain(HOUSE_ID);
      // The judge is the other player.
      const owner = builders.find((x) => x !== HOUSE_ID)!;
      expect(logic.votersFor(s, b)).toEqual(s.players.map((p) => p.id).filter((id) => id !== owner));
    }
  });

  it('rejects drawings that are not in the player\'s own storage folder', () => {
    let s = logic.init(makePlayers(4), SETTINGS, content, 3);
    s = logic.onTimerEnd(s);
    const [a, b] = s.players.map((p) => p.id);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { url: drawingUrl(b) } })).toBe(s);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { url: 'https://evil.example/x.png' } })).toBe(s);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: a, round: r(s), payload: { url: drawingUrl(a) } }).drawings).toHaveLength(1);
  });

  it('fills in House pieces and auto-builds shirts when nobody plays', () => {
    const end = play(shirtShowdown, logic.init(makePlayers(4), SETTINGS, content, 4), null);
    expect(end.phase).toBe('done');
    expect(end.shirts.filter((x) => x.builderId !== HOUSE_ID)).toHaveLength(4);
  });

  it('hides who built each shirt until the reveal', () => {
    play(shirtShowdown, logic.init(makePlayers(4), SETTINGS, content, 5), bot, {
      onStep: (s) => {
        if (s.phase === 'battle') {
          const view = logic.publicView(s);
          expect(view.reveal).toBeNull();
          const shirtIds = JSON.stringify([view.left?.id, view.right?.id]);
          for (const p of s.players) expect(shirtIds).not.toContain(p.id);
        }
      },
    });
  });
});
