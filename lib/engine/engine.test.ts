import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { isRoomCode } from '@/lib/room-code';
import { isDrawingUrl } from './drawings';
import { censor, filterText, isProfane, validateName } from './filter';
import { houseFill } from './house';
import { rng, shuffle } from './rng';
import { clearWinner, plurality, rank, tally, topScorers } from './scoring';
import { isFuzzyMatch, levenshtein, normalizeAnswer, sameText, sanitizeInput } from './text';
import { effectiveSeconds, secondsLeft } from './timers';

describe('profanity filter', () => {
  it('catches profanity, leetspeak and spaced-out spellings', () => {
    expect(isProfane('what the fuck')).toBe(true);
    expect(isProfane('sh1t')).toBe(true);
    expect(isProfane('f u c k')).toBe(true);
    expect(isProfane('fuuuuck')).toBe(true);
  });
  it('leaves innocent words alone', () => {
    for (const ok of ['Scunthorpe', 'class', 'cocktail', 'assess', 'grapes', 'hello', 'Shell', 'spicy', 'titles']) expect(isProfane(ok)).toBe(false);
  });
  it('censors only the bad word, and only in family mode', () => {
    expect(censor('this is shit pizza')).toBe('this is **** pizza');
    expect(filterText('this is shit', false)).toBe('this is shit');
  });
  it('validates names: 1 to 12 characters, profanity filtered', () => {
    expect(validateName('  Sam  ')).toEqual({ ok: true, name: 'Sam' });
    expect(validateName('')).toMatchObject({ ok: false });
    expect(validateName('ThirteenChars')).toMatchObject({ ok: false });
    expect(validateName('b1tch')).toMatchObject({ ok: false });
  });
});

describe('text helpers', () => {
  it('sanitizes input and enforces the 60 character default', () => {
    expect(sanitizeInput('  a\n\tb  ')).toBe('a b');
    expect(sanitizeInput('x'.repeat(100))).toHaveLength(60);
    expect(sanitizeInput(42)).toBe('');
  });
  it('fuzzy-matches small typos but not different answers', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(normalizeAnswer('The Lion King!')).toBe('lion king');
    expect(isFuzzyMatch('jurasic park', 'Jurassic Park')).toBe(true);
    expect(isFuzzyMatch('spiderman', 'Spider-Man')).toBe(true);
    expect(isFuzzyMatch('up', 'Up')).toBe(true);
    expect(isFuzzyMatch('us', 'Up')).toBe(false);
    expect(isFuzzyMatch('frozen', 'Titanic')).toBe(false);
    expect(sameText('Pepper-X', 'pepper x')).toBe(true);
  });
});

describe('timers', () => {
  it('scales only input timers', () => {
    const input = { seconds: 20, kind: 'input' as const };
    expect(effectiveSeconds(input, DEFAULT_SETTINGS)).toBe(20);
    expect(effectiveSeconds(input, { ...DEFAULT_SETTINGS, timerLength: 'extended' })).toBe(30);
    expect(effectiveSeconds(input, { ...DEFAULT_SETTINGS, timerLength: 'off' })).toBeNull();
    expect(effectiveSeconds({ seconds: 6, kind: 'display' }, { ...DEFAULT_SETTINGS, timerLength: 'off' })).toBe(6);
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(null, 0)).toBeNull();
  });
});

describe('scoring and randomness', () => {
  it('tallies votes with an audience bonus and finds winners', () => {
    const counts = tally({ a: 'x', b: 'y', c: 'x' }, 'y');
    expect(counts).toEqual({ x: 2, y: 2 });
    expect(plurality(counts).sort()).toEqual(['x', 'y']);
    expect(clearWinner(counts)).toBeNull();
    expect(topScorers({ a: 5, b: 5, c: 1 })).toEqual(['a', 'b']);
    expect(topScorers({ a: 0, b: 0 })).toEqual([]);
    expect(rank({ a: 5, b: 5, c: 1 }, ['a', 'b', 'c']).map((r) => r.rank)).toEqual([1, 1, 3]);
  });
  it('is deterministic for the same seed', () => {
    expect(shuffle([1, 2, 3, 4, 5], rng(1, 'x'))).toEqual(shuffle([1, 2, 3, 4, 5], rng(1, 'x')));
  });
  it('fills House options without duplicating existing ones', () => {
    const out = houseFill(['Paris'], 4, ['paris', 'Rome', 'Oslo', 'Lima', 'Bern'], rng(2));
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.toLowerCase())).not.toContain('paris');
  });
});

describe('room codes and drawing URLs', () => {
  it('uses 4 consonants only (FR-1)', () => {
    expect(isRoomCode('BCDF')).toBe(true);
    expect(isRoomCode('BADF')).toBe(false);
    expect(isRoomCode('BCD')).toBe(false);
  });
  it("accepts only drawings in the sender's own storage folder", () => {
    const player = '00000000-0000-4000-8000-000000000001';
    const room = '11111111-1111-4111-8111-111111111111';
    const file = '22222222-2222-4222-8222-222222222222';
    const base = 'https://example.supabase.co/storage/v1/object/public/drawings';
    expect(isDrawingUrl(`${base}/${room}/${player}/${file}.png`, player)).toBe(true);
    expect(isDrawingUrl(`${base}/${room}/00000000-0000-4000-8000-000000000002/${file}.png`, player)).toBe(false);
    expect(isDrawingUrl(`https://evil.example/storage/v1/object/public/drawings/${room}/${player}/${file}.png`, player)).toBe(false);
    expect(isDrawingUrl('javascript:alert(1)', player)).toBe(false);
  });
});
