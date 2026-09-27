'use client';

import { useEffect } from 'react';
import { themeVars, type Theme } from '@/lib/theme';

/** Applies the room's color scheme to the whole page via the CSS tokens. */
export function ThemeStyle({ theme }: { theme: Theme | null | undefined }) {
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const vars = themeVars(theme);
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.plum);
  }, [theme]);
  return null;
}
