import { describe, expect, it } from 'vitest';
import { loadPacks, makePlayers, play, r, SETTINGS } from '../__tests__/harness';
import { imposter } from './index';
import * as logic from './logic';

const content = loadPacks(['imposter']);

function toClues(s: logic.ImposterState) {
  return logic.onTimerEnd(logic.onTimerEnd(s)); // intro -> secret -> clue
}

describe('Imposter', () => {
  it('gives everyone the word except one imposter (classic, 4+ players)', () => {
    const s = toClues(logic.init(makePlayers(5), SETTINGS, content, 1));
    expect(s.mode).toBe('classic');
    const words = s.players.map((p) => logic.wordFor(s, p.id));
    expect(words.filter((w) => w === null)).toHaveLength(1);
    expect(new Set(words.filter(Boolean)).size).toBe(1);
  });

  it('uses double-blind words for 2 and 3 players', () => {
    const s = toClues(logic.init(makePlayers(3), SETTINGS, content, 2));
    expect(s.mode).toBe('double');
    for (const p of s.players) expect(logic.wordFor(s, p.id)).toBeTruthy();
    const round = s.rounds[0];
    for (const p of s.players) expect([round.word, round.decoy]).toContain(logic.wordFor(s, p.id));
  });

  it('rejects multi-word clues and clues that give away your own word, but never the imposter\'s', () => {
    let s = toClues(logic.init(makePlayers(4), SETTINGS, content, 3));
    const active = logic.activePlayer(s);
    const word = logic.wordFor(s, active);
    const tryClue = (text: string) => logic.onAction(s, { type: 'SUBMIT', playerId: active, round: r(s), payload: { text } });
    expect(tryClue('two words').errors[active]?.text).toMatch(/One word/);
    if (word) {
      expect(tryClue(word).errors[active]?.text).toMatch(/Too close/);
    } else {
      // The imposter saying the word by luck is accepted silently.
      expect(tryClue(s.rounds[0].word).clues).toHaveLength(1);
    }
    s = tryClue('hint');
    expect(s.clues).toHaveLength(1);
    expect(s.phase).toBe('clue');
  });

  it('lets a caught imposter steal the win by guessing the word', () => {
    let s = toClues(logic.init(makePlayers(4), SETTINGS, content, 4));
    while (s.phase === 'clue') s = logic.onTimerEnd(s);
    expect(s.phase).toBe('vote');
    const imp = s.imposter!;
    for (const p of s.players) if (p.id !== imp) s = logic.onAction(s, { type: 'VOTE', playerId: p.id, round: r(s), choiceId: imp });
    s = logic.onAction(s, { type: 'VOTE', playerId: imp, round: r(s), choiceId: s.players.find((p) => p.id !== imp)!.id });
    s = logic.onTimerEnd(s);
    expect(s.accused).toBe(imp);
    expect(logic.publicView(s)?.reveal?.word).toBe('');
    s = logic.onTimerEnd(s);
    expect(s.phase).toBe('guess');
    s = logic.onAction(s, { type: 'SUBMIT', playerId: imp, round: r(s), payload: { word: s.rounds[0].word } });
    s = logic.onTimerEnd(s);
    expect(s.scores[imp]).toBe(1000);
  });

  it('keeps the secret word and imposter out of public views before the reveal', () => {
    play(imposter, logic.init(makePlayers(5), SETTINGS, content, 5), null, {
      onStep: (s) => {
        if (['secret', 'clue', 'vote'].includes(s.phase)) {
          const view = logic.publicView(s)!;
          expect(JSON.stringify(view)).not.toContain(`"${s.rounds[s.roundIndex].word}"`);
          expect(view.imposterId).toBeNull();
          expect(view.reveal).toBeNull();
        }
      },
    });
  });

  it('plays all rounds for 2 and 8 players', () => {
    for (const n of [2, 8]) {
      const end = play(imposter, logic.init(makePlayers(n), SETTINGS, content, n), (s, id) => {
        if (s.phase === 'clue' && logic.activePlayer(s) === id) return { type: 'SUBMIT', playerId: id, round: r(s), payload: { text: `c${s.turn}x` } };
        if (s.phase === 'vote' && !s.submitted.includes(id)) return { type: 'VOTE', playerId: id, round: r(s), choiceId: s.players.find((p) => p.id !== id)!.id };
        if (s.phase === 'judge' && !s.submitted.includes(id)) {
          const calls = Object.fromEntries(s.players.filter((p) => p.id !== id).map((p) => [p.id, true]));
          return { type: 'SUBMIT', playerId: id, round: r(s), payload: { calls } };
        }
        return null;
      });
      expect(end.phase).toBe('done');
      expect(end.roundIndex).toBe(logic.ROUNDS - 1);
    }
  });
});
