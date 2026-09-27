/**
 * Profanity filter for names (always) and player text (family-friendly mode).
 * Matches whole words after undoing common leetspeak, plus a short list of
 * roots that are never innocent inside a longer word. Whole-word matching
 * keeps "Scunthorpe", "class" and "cocktail" safe.
 */

const BLOCKED_WORDS = [
  'anal', 'anus', 'arse', 'arsehole', 'ass', 'asshat', 'asshole', 'bastard', 'bellend', 'bitch',
  'bollocks', 'boner', 'boob', 'boobs', 'bugger', 'bullshit', 'butthole', 'chink', 'clit',
  'cock', 'cocks', 'coon', 'crap', 'cum', 'cumshot', 'cunt', 'damn', 'dick', 'dickhead', 'dildo',
  'dyke', 'fag', 'faggot', 'fanny', 'feck', 'fuck', 'fucker', 'fucking', 'gook', 'handjob', 'hell',
  'homo', 'horny', 'jackass', 'jizz', 'kike', 'knob', 'milf', 'motherfucker', 'nazi', 'negro',
  'nigga', 'nigger', 'nipple', 'nude', 'nudes', 'orgasm', 'paki', 'penis', 'piss', 'porn', 'porno',
  'prick', 'pussy', 'queef', 'rape', 'rapist', 'retard', 'scrotum', 'sex', 'sexy', 'shag', 'shit',
  'shithead', 'skank', 'slut', 'spic', 'tit', 'tits', 'titties', 'twat', 'vagina', 'wank',
  'wanker', 'whore', 'wetback', 'kys',
];

// Roots that are offensive even glued inside another word ("fuckface").
const BLOCKED_ROOTS = ['fuck', 'nigg', 'faggot', 'cunt', 'shit', 'bitch', 'whore', 'slut', 'wank', 'jizz'];

// Innocent words that contain a blocked root.
const ALLOWED = new Set(['scunthorpe', 'shiitake', 'shitake', 'cocktail', 'peacock', 'hancock', 'hitchcock']);

const SUFFIXES = ['', 's', 'es'];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g',
};

const blocked = new Set(BLOCKED_WORDS);

function unleet(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0134@57+89$!|]/g, (c) => LEET[c] ?? c);
}

function collapseRepeats(word: string): string {
  return word.replace(/(.)\1+/g, '$1');
}

function isBlockedWord(word: string): boolean {
  if (!word || ALLOWED.has(word)) return false;
  const candidates = new Set([word, collapseRepeats(word)]);
  for (const w of candidates) {
    for (const suffix of SUFFIXES) {
      if (suffix && !w.endsWith(suffix)) continue;
      const stem = suffix ? w.slice(0, -suffix.length) : w;
      if (blocked.has(stem)) return true;
    }
    if (BLOCKED_ROOTS.some((root) => w.includes(root))) return true;
  }
  return false;
}

function words(text: string): { word: string; start: number; end: number }[] {
  const out: { word: string; start: number; end: number }[] = [];
  const normalized = unleet(text);
  const re = /[a-z]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) {
    out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function isProfane(text: string): boolean {
  const tokens = words(text);
  if (tokens.some((t) => isBlockedWord(t.word))) return true;
  // Catch spaced-out spellings like "f u c k" by joining runs of single letters.
  const singles = tokens.filter((t) => t.word.length === 1).map((t) => t.word).join('');
  return singles.length >= 3 && BLOCKED_ROOTS.concat(BLOCKED_WORDS.filter((w) => w.length >= 4)).some((w) => singles.includes(w));
}

/** Replaces offending words with asterisks, keeping the rest of the text. */
export function censor(text: string): string {
  const normalized = unleet(text);
  if (normalized.length !== text.length) {
    return isProfane(text) ? '*'.repeat(Math.min(text.length, 8)) : text;
  }
  let out = text;
  for (const t of words(text)) {
    if (isBlockedWord(t.word)) {
      out = out.slice(0, t.start) + '*'.repeat(t.end - t.start) + out.slice(t.end);
    }
  }
  if (isProfane(out)) return '*'.repeat(Math.min(text.length, 8));
  return out;
}

/** Applies the family-friendly setting to a piece of player text. */
export function filterText(text: string, familyFriendly: boolean): string {
  return familyFriendly ? censor(text) : text;
}

export const NAME_MAX = 12;

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/** Names are 1 to 12 characters and always profanity-filtered (PRD §2). */
export function validateName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'Enter a name.' };
  const name = Array.from(
    raw
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ).join('');
  const length = Array.from(name).length;
  if (length < 1) return { ok: false, error: 'Enter a name.' };
  if (length > NAME_MAX) return { ok: false, error: `Names can be up to ${NAME_MAX} characters.` };
  if (isProfane(name)) return { ok: false, error: 'Please pick a different name.' };
  return { ok: true, name };
}
