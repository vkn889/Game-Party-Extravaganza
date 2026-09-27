import type { CSSProperties, ReactNode } from 'react';
import { GAME_META, type PatternKind } from '@/games/meta';
import type { GameSlug } from '@/lib/types';

/** Each game's accent pattern (PRD §4), drawn faintly over the shared plum base. */
function patternStyle(kind: PatternKind, accent: string): CSSProperties {
  const c = `${accent}22`;
  const size = (s: number) => ({ backgroundSize: `${s}px ${s}px` });
  switch (kind) {
    case 'dots':
      return { backgroundImage: `radial-gradient(${c} 3px, transparent 3.5px)`, ...size(36) };
    case 'stripes':
      return { backgroundImage: `repeating-linear-gradient(45deg, ${c} 0 12px, transparent 12px 40px)` };
    case 'grid':
      return {
        backgroundImage: `linear-gradient(${c} 2px, transparent 2px), linear-gradient(90deg, ${c} 2px, transparent 2px)`,
        ...size(48),
      };
    case 'zigzag':
      return {
        backgroundImage: `linear-gradient(135deg, ${c} 25%, transparent 25%), linear-gradient(225deg, ${c} 25%, transparent 25%)`,
        ...size(40),
      };
    case 'waves':
      return { backgroundImage: `radial-gradient(circle at 50% 100%, transparent 14px, ${c} 15px, ${c} 18px, transparent 19px)`, ...size(44) };
    case 'confetti':
      return {
        backgroundImage: `radial-gradient(${c} 4px, transparent 5px), radial-gradient(${accent}18 3px, transparent 4px)`,
        backgroundSize: '60px 60px, 38px 38px',
        backgroundPosition: '0 0, 19px 23px',
      };
    case 'checks':
      return {
        backgroundImage: `conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0)`,
        ...size(56),
      };
    case 'rings':
      return { backgroundImage: `radial-gradient(circle, transparent 10px, ${c} 11px, ${c} 13px, transparent 14px)`, ...size(52) };
    case 'diamonds':
      return {
        backgroundImage: `linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%)`,
        ...size(46),
      };
    case 'plus':
      return {
        backgroundImage: `linear-gradient(${c} 0 0), linear-gradient(${c} 0 0)`,
        backgroundSize: '4px 18px, 18px 4px',
        backgroundPosition: '22px 15px, 15px 22px',
        backgroundRepeat: 'repeat',
      };
    case 'bolts':
      return { backgroundImage: `repeating-linear-gradient(-60deg, ${c} 0 6px, transparent 6px 34px)` };
    case 'bubbles':
      return {
        backgroundImage: `radial-gradient(circle, ${c} 9px, transparent 10px), radial-gradient(circle, ${accent}14 5px, transparent 6px)`,
        backgroundSize: '70px 70px, 44px 44px',
        backgroundPosition: '0 0, 22px 30px',
      };
    case 'coins':
      return { backgroundImage: `radial-gradient(circle, ${c} 8px, transparent 9px, transparent 12px, ${c} 13px, transparent 14px)`, ...size(58) };
    case 'sparks':
      return { backgroundImage: `repeating-conic-gradient(from 0deg, ${c} 0 8deg, transparent 8deg 45deg)`, ...size(90) };
    case 'hearts':
      return { backgroundImage: `radial-gradient(circle at 35% 40%, ${c} 5px, transparent 6px), radial-gradient(circle at 65% 40%, ${c} 5px, transparent 6px)`, ...size(40) };
  }
}

export function GameBackdrop({ slug, children, className = '' }: { slug: GameSlug | null; children: ReactNode; className?: string }) {
  const meta = slug ? GAME_META[slug] : null;
  return (
    <div className={`relative isolate ${className}`}>
      {meta && <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={patternStyle(meta.pattern, meta.accent)} />}
      {children}
    </div>
  );
}
