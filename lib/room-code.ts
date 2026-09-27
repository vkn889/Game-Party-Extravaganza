/** Room codes: 4 consonants, no vowels, so they never spell accidental words (FR-1). */
export const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';

export function normalizeCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function isRoomCode(value: string): boolean {
  return /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(value);
}
