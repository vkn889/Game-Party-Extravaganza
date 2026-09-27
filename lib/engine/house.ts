/**
 * The House: a built-in stand-in player that keeps small games interesting.
 * It contributes pre-written answers, decoys, doodles and bids from the
 * game's prompt pack so 2 people always have a real choice to make.
 * The House never wins a game and never appears in the players list.
 */
import { shuffle, type Rand } from './rng';
import { sameText } from './text';

export const HOUSE_ID = 'house';
export const HOUSE_NAME = 'The House';
export const HOUSE_COLOR = '#F2D1C9';

/** True when a game should switch to its 2-to-3-player rule. */
export function isSmallGroup(playerCount: number): boolean {
  return playerCount <= 3;
}

/**
 * Picks House entries from `decoys` that don't duplicate anything already in
 * `existing`, until the list reaches `target` options.
 */
export function houseFill(existing: string[], target: number, decoys: string[], rand: Rand): string[] {
  const out: string[] = [];
  for (const decoy of shuffle(decoys, rand)) {
    if (existing.length + out.length >= target) break;
    if ([...existing, ...out].some((e) => sameText(e, decoy))) continue;
    out.push(decoy);
  }
  return out;
}

function svg(body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#FFF8F5"/>${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
}

/** Stand-in drawings for the House (and for players who ran out of time). */
export const HOUSE_DOODLES: string[] = [
  svg(
    '<circle cx="200" cy="200" r="120" fill="#E086D3" stroke="#2A1530" stroke-width="8"/><circle cx="160" cy="175" r="14" fill="#2A1530"/><circle cx="240" cy="175" r="14" fill="#2A1530"/><path d="M140 235 Q200 295 260 235" stroke="#2A1530" stroke-width="10" fill="none" stroke-linecap="round"/>',
  ),
  svg(
    '<polygon points="200,60 236,160 342,160 256,222 290,326 200,262 110,326 144,222 58,160 164,160" fill="#8332AC" stroke="#2A1530" stroke-width="8" stroke-linejoin="round"/>',
  ),
  svg(
    '<path d="M200 330 C80 250 60 170 120 120 C160 90 195 115 200 145 C205 115 240 90 280 120 C340 170 320 250 200 330Z" fill="#E086D3" stroke="#2A1530" stroke-width="8"/>',
  ),
  svg(
    '<circle cx="200" cy="200" r="70" fill="#F2D1C9" stroke="#2A1530" stroke-width="8"/><g stroke="#D98E7C" stroke-width="12" stroke-linecap="round"><line x1="200" y1="60" x2="200" y2="100"/><line x1="200" y1="300" x2="200" y2="340"/><line x1="60" y1="200" x2="100" y2="200"/><line x1="300" y1="200" x2="340" y2="200"/><line x1="100" y1="100" x2="128" y2="128"/><line x1="272" y1="272" x2="300" y2="300"/><line x1="300" y1="100" x2="272" y2="128"/><line x1="128" y1="272" x2="100" y2="300"/></g>',
  ),
  svg(
    '<polygon points="230,50 120,220 190,220 160,350 290,160 215,160" fill="#BAD1CD" stroke="#2A1530" stroke-width="8" stroke-linejoin="round"/>',
  ),
  svg(
    '<path d="M110 300 L200 80 L290 300 Z" fill="#F2D1C9" stroke="#2A1530" stroke-width="8" stroke-linejoin="round"/><circle cx="185" cy="190" r="16" fill="#E086D3"/><circle cx="225" cy="240" r="16" fill="#E086D3"/><circle cx="170" cy="255" r="12" fill="#E086D3"/>',
  ),
  svg(
    '<ellipse cx="200" cy="230" rx="120" ry="90" fill="#8332AC" stroke="#2A1530" stroke-width="8"/><polygon points="110,170 120,80 170,150" fill="#8332AC" stroke="#2A1530" stroke-width="8"/><polygon points="290,170 280,80 230,150" fill="#8332AC" stroke="#2A1530" stroke-width="8"/><circle cx="165" cy="220" r="12" fill="#FFF8F5"/><circle cx="235" cy="220" r="12" fill="#FFF8F5"/><path d="M185 260 L200 272 L215 260" stroke="#FFF8F5" stroke-width="6" fill="none"/>',
  ),
  svg(
    '<rect x="150" y="90" width="100" height="190" rx="50" fill="#BAD1CD" stroke="#2A1530" stroke-width="8"/><circle cx="200" cy="160" r="22" fill="#8332AC"/><polygon points="150,240 110,300 150,290" fill="#E086D3" stroke="#2A1530" stroke-width="6"/><polygon points="250,240 290,300 250,290" fill="#E086D3" stroke="#2A1530" stroke-width="6"/><path d="M180 285 L200 340 L220 285" fill="#D98E7C"/>',
  ),
];

export function houseDoodle(rand: Rand): string {
  return HOUSE_DOODLES[Math.floor(rand() * HOUSE_DOODLES.length)];
}
