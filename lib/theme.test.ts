import { describe, expect, it } from 'vitest';
import { normalizeSettings } from './settings';
import { contrast, DEFAULT_THEME, sanitizeTheme, THEME_PRESETS, themeVars } from './theme';
import { DEFAULT_SETTINGS } from './types';

describe('themes', () => {
  it('keeps every preset readable (WCAG AA for text on background and on success color)', () => {
    for (const p of THEME_PRESETS) {
      expect(contrast(p.theme.peach, p.theme.plum), p.name).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.theme.plum, p.theme.mint), p.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('sanitizes custom colors per token', () => {
    expect(sanitizeTheme({ plum: '#123456', pink: 'javascript:1' })).toEqual({ ...DEFAULT_THEME, plum: '#123456' });
    expect(sanitizeTheme(null)).toEqual(DEFAULT_THEME);
  });

  it('derives the deeper and raised background shades', () => {
    const vars = themeVars(DEFAULT_THEME);
    expect(vars['--plum']).toBe('#462749');
    expect(vars['--plum-deep']).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars['--plum-raised']).not.toBe(vars['--plum']);
  });

  it('normalizes room settings from partial or hostile input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({ musicTrack: 4, musicVolume: 7, timerLength: 'forever', theme: { mint: '#ABCDEF' } });
    expect(s.musicTrack).toBe(4);
    expect(s.musicVolume).toBe(1);
    expect(s.timerLength).toBe('normal');
    expect(s.theme.mint).toBe('#ABCDEF');
  });
});
