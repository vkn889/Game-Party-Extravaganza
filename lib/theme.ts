/**
 * Room color schemes. A theme is the five PRD tokens; the host can pick a
 * preset or edit each color, and every screen in the room follows it.
 */
export interface Theme {
  plum: string; // background
  purple: string; // primary buttons, headers, selected states
  pink: string; // timers, "your turn", winners, focus rings
  peach: string; // main text, card surfaces
  mint: string; // success, submitted, secondary buttons
}

export const THEME_KEYS = ['plum', 'purple', 'pink', 'peach', 'mint'] as const;

export const THEME_LABELS: Record<keyof Theme, string> = {
  plum: 'Background',
  purple: 'Primary',
  pink: 'Highlight',
  peach: 'Text & cards',
  mint: 'Success',
};

export const THEME_PRESETS: { id: string; name: string; theme: Theme }[] = [
  { id: 'classic', name: 'Classic', theme: { plum: '#462749', purple: '#8332AC', pink: '#E086D3', peach: '#F2D1C9', mint: '#BAD1CD' } },
  { id: 'ocean', name: 'Ocean', theme: { plum: '#12324A', purple: '#1F6FB2', pink: '#FFB547', peach: '#E6F1F7', mint: '#8FD6C3' } },
  { id: 'sunset', name: 'Sunset', theme: { plum: '#3B1F2B', purple: '#C2410C', pink: '#FBBF24', peach: '#FDE8D7', mint: '#A7D7A0' } },
  { id: 'forest', name: 'Forest', theme: { plum: '#1E3325', purple: '#2F7D4F', pink: '#F59E8B', peach: '#EEF3E2', mint: '#B8E0A8' } },
  { id: 'midnight', name: 'Midnight', theme: { plum: '#141827', purple: '#5B5BD6', pink: '#F472B6', peach: '#E8EAF6', mint: '#7DD3C0' } },
  { id: 'candy', name: 'Candy', theme: { plum: '#4A1942', purple: '#D63384', pink: '#FFD60A', peach: '#FFF0F5', mint: '#9EE6CF' } },
];

export const DEFAULT_THEME: Theme = THEME_PRESETS[0].theme;

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/** A valid theme from untrusted input, falling back per color to the default. */
export function sanitizeTheme(value: unknown): Theme {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof Theme, unknown>>;
  const out = { ...DEFAULT_THEME };
  for (const key of THEME_KEYS) if (isHex(input[key])) out[key] = (input[key] as string).toUpperCase();
  return out;
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `#${rgb.map((c, i) => Math.round(c + (target[i] - c) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** CSS custom properties for a theme, including the derived deep and raised background shades. */
export function themeVars(theme: Theme): Record<string, string> {
  return {
    '--plum': theme.plum,
    '--purple': theme.purple,
    '--pink': theme.pink,
    '--peach': theme.peach,
    '--mint': theme.mint,
    '--plum-deep': mix(theme.plum, [0, 0, 0], 0.35),
    '--plum-raised': mix(theme.plum, [255, 255, 255], 0.1),
  };
}

export function sameTheme(a: Theme, b: Theme): boolean {
  return THEME_KEYS.every((k) => a[k].toUpperCase() === b[k].toUpperCase());
}
