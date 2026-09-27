import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { setDictionary } from './dictionary';
import { wordBomb } from './index';
import * as logic from './logic';

const content = loadPacks(['word-bomb']);
let dictionary: string[] = [];

beforeAll(() => {
  dictionary = fs.readFileSync(path.resolve(__dirname, '../../public/dict/words.txt'), 'utf8').split('\n').filter(Boolean);
  setDictionary(dictionary);
});

const start = (n: number, seed: number) => logic.onTimerEnd(logic.init(makePlayers(n), SETTINGS, content, seed));
const wordWith = (s: logic.WordBombState) => dictionary.find((w) => w.includes(logic.combo(s)) && !s.used.includes(w) && w.length >= 3)!;

describe('Word Bomb', () => {
  it('every combo in the pack has plenty of real words', () => {
    for (const item of content['word-bomb']) {
      const c = item.text.toLowerCase();
      expect(dictionary.filter((w) => w.includes(c)).length).toBeGreaterThan(1000);
    }
  });

  it('only the active player can answer, with a real unused word containing the combo', () => {
    let s = start(3, 1);
    const active = logic.activeId(s);
    const other = s.players.find((p) => p.id !== active)!.id;
    const word = wordWith(s);
    const firstCombo = logic.combo(s);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: other, round: r(s), payload: { word } })).toBe(s);
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: active, round: r(s), payload: { word: 'zzzqqq' } }).errors[active]).toBeTruthy();
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: active, round: r(s), payload: { word: 'xylophonez' + logic.combo(s) } }).errors[active]?.text).toMatch(/dictionary/);
    s = logic.onAction(s, { type: 'SUBMIT', playerId: active, round: r(s), payload: { word } });
    expect(s.used).toEqual([word]);
    expect(logic.activeId(s)).not.toBe(active);
    s = { ...s, combos: s.combos.map(() => firstCombo) }; // same letters again: the word is now taken
    expect(logic.onAction(s, { type: 'SUBMIT', playerId: logic.activeId(s), round: r(s), payload: { word } }).errors[logic.activeId(s)]?.text).toMatch(/Already/);
  });

  it('keeps the fuse hidden and costs a life when it goes off', () => {
    let s = start(2, 2);
    expect(s.timer?.hidden).toBe(true);
    const active = logic.activeId(s);
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('boom');
    expect(s.lives[active]).toBe(logic.LIVES - 1);
  });

  it('skips a disconnected player instead of blowing them up', () => {
    let s = start(3, 3);
    const active = logic.activeId(s);
    s = { ...s, connected: s.connected.filter((id) => id !== active) };
    expect(logic.isStepComplete(s)).toBe(true);
    s = logic.onTimerEnd(s);
    expect(s.lives[active]).toBe(logic.LIVES);
    expect(logic.activeId(s)).not.toBe(active);
  });

  it('ends when one player is left standing, who wins', () => {
    const end = play(wordBomb, logic.init(makePlayers(3), SETTINGS, content, 4), (s, id) =>
      s.phase === 'turn' && id === logic.activeId(s) && id === s.players[0].id ? { type: 'SUBMIT', playerId: id, round: r(s), payload: { word: wordWith(s) } } : null,
    );
    expect(end.phase).toBe('done');
    expect(logic.winners(end)).toEqual([end.players[0].id]);
  });
});
