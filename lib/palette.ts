/** Design tokens from PRD §4. Mirrored as CSS variables in app/globals.css. */
export const PALETTE = {
  plum: '#462749',
  purple: '#8332AC',
  pink: '#E086D3',
  peach: '#F2D1C9',
  mint: '#BAD1CD',
} as const;

/** 8 distinct avatar colors derived from the palette (tints and shades). */
export const AVATAR_COLORS = [
  '#E086D3', // pink
  '#BAD1CD', // mint
  '#F2D1C9', // peach
  '#B57BE0', // purple tint
  '#7DB5AB', // mint shade
  '#E59F88', // peach shade
  '#F7D9F2', // pink tint
  '#D7C6F2', // purple pale tint
] as const;

export const AUDIENCE_COLOR = '#A48DA6';

/** 6 drawing colors from the palette, darkened where needed to show on the light canvas. */
export const CANVAS_COLORS = ['#2A1530', '#8332AC', '#E086D3', '#5E9990', '#D98E7C', '#FFFFFF'] as const;
export const CANVAS_BACKGROUND = '#FFF8F5';
export const BRUSH_SIZES = [4, 10, 22] as const;
