export const DEFAULT_MAX_CHARS = 60;

/** Trims, collapses whitespace, strips control characters and enforces a length cap. */
export function sanitizeInput(value: unknown, maxChars = DEFAULT_MAX_CHARS): string {
  if (typeof value !== 'string') return '';
  return Array.from(
    value
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, maxChars)
    .join('')
    .trim();
}

/** Lowercase, drop punctuation, accents and leading articles for answer comparison. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed for an answer of this length. */
export function typoAllowance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  if (length <= 12) return 2;
  return 3;
}

/** Fuzzy match that forgives small typos; `answer` may list alternatives separated by "|". */
export function isFuzzyMatch(guess: string, answer: string): boolean {
  const g = normalizeAnswer(guess);
  if (!g) return false;
  return answer.split('|').some((alt) => {
    const a = normalizeAnswer(alt);
    if (!a) return false;
    if (g === a || g.replace(/ /g, '') === a.replace(/ /g, '')) return true;
    return levenshtein(g, a) <= typoAllowance(a.length);
  });
}

/** Exact after normalization: used to spot lies that are really the truth, or duplicates. */
export function sameText(a: string, b: string): boolean {
  const na = normalizeAnswer(a).replace(/ /g, '');
  const nb = normalizeAnswer(b).replace(/ /g, '');
  return na.length > 0 && na === nb;
}
