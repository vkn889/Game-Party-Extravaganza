/**
 * Deterministic randomness. Game logic must stay pure, so every random choice
 * derives from the state's seed plus a salt (usually the step and a label).
 */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rng(seed: number, ...salt: (string | number)[]): Rand {
  return mulberry32(hashString(`${seed}|${salt.join('|')}`));
}

export function randInt(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

export function shuffle<T>(items: readonly T[], rand: Rand): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: readonly T[], rand: Rand): T {
  return items[Math.floor(rand() * items.length)];
}

/** Draw `count` items without replacement, recycling the pool if it runs short. */
export function draw<T>(items: readonly T[], count: number, rand: Rand): T[] {
  if (items.length === 0) return [];
  const out: T[] = [];
  let pool = shuffle(items, rand);
  while (out.length < count) {
    if (pool.length === 0) pool = shuffle(items, rand);
    out.push(pool.pop() as T);
  }
  return out;
}

export function newSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

/** Short opaque id, deterministic from a Rand. Used for anonymous option ids. */
export function opaqueId(rand: Rand): string {
  return Math.floor(rand() * 2 ** 32)
    .toString(36)
    .padStart(7, '0');
}
