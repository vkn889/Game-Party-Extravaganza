'use client';

import { m } from 'framer-motion';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { GameIcon } from '@/components/shared/GameIcon';
import { GAME_META } from '@/games/meta';
import { isSmallGroup, HOUSE_ID, HOUSE_NAME, HOUSE_COLOR } from '@/lib/engine/house';
import type { GameSlug, Player } from '@/lib/types';

/** Large prompt text for the stage (48 px, PRD §4). */
export function StagePrompt({ children, kicker }: { children: ReactNode; kicker?: ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 160, damping: 20 }}
      className="mx-auto max-w-5xl text-center"
    >
      {kicker && <p className="font-display mb-4 text-2xl font-semibold uppercase tracking-wide text-mint">{kicker}</p>}
      <h2 className="font-display stage-prompt font-bold text-peach">{children}</h2>
    </m.div>
  );
}

export function StageNote({ children }: { children: ReactNode }) {
  return <p className="font-display text-center text-3xl text-peach/85">{children}</p>;
}

/** The how-to-play card shown in every game's intro step. */
export function GameIntro({ slug, playerCount }: { slug: GameSlug; playerCount: number }) {
  const meta = GAME_META[slug];
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center"
    >
      <span className="flex h-28 w-28 items-center justify-center rounded-full bg-purple text-peach shadow-card">
        <GameIcon slug={slug} className="h-16 w-16" />
      </span>
      <h2 className="font-display text-7xl font-bold">{meta.name}</h2>
      <p className="text-3xl leading-snug text-peach/90">{meta.howToPlay}</p>
      {isSmallGroup(playerCount) && meta.smallGroupRule !== 'Works as is.' && (
        <p className="rounded-2xl bg-plum-raised px-6 py-4 text-2xl text-mint">{meta.smallGroupRule}</p>
      )}
    </m.div>
  );
}

export function PlayerTag({ player, size = 'md' }: { player: Pick<Player, 'name' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={player.name} color={player.color} size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'} />
      <span className={`font-display font-semibold ${size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl'}`}>
        {player.name}
      </span>
    </span>
  );
}

export function findPlayer(players: Player[], id: string): Pick<Player, 'name' | 'color'> {
  if (id === HOUSE_ID) return { name: HOUSE_NAME, color: HOUSE_COLOR };
  return players.find((p) => p.id === id) ?? { name: 'Someone', color: '#A48DA6' };
}

/** A card for an answer/option on the stage, with optional reveal details. */
export function OptionCard({
  label,
  index,
  highlight = false,
  children,
  dim = false,
}: {
  label: ReactNode;
  index?: number;
  highlight?: boolean;
  dim?: boolean;
  children?: ReactNode;
}) {
  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: dim ? 0.55 : 1, y: 0, scale: highlight ? 1.03 : 1 }}
      transition={{ delay: (index ?? 0) * 0.08 }}
      className={`flex flex-col gap-3 rounded-3xl px-7 py-5 shadow-card ${highlight ? 'bg-mint text-plum' : 'bg-peach text-plum'}`}
    >
      <p className="font-display text-4xl font-semibold leading-tight">{label}</p>
      {children}
    </m.div>
  );
}

export function VoterDots({ voters }: { voters: Pick<Player, 'name' | 'color'>[] }) {
  if (voters.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {voters.map((v, i) => (
        <m.span key={`${v.name}-${i}`} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.08 }}>
          <Avatar name={v.name} color={v.color} size="sm" />
        </m.span>
      ))}
    </div>
  );
}

export function PointsBadge({ points }: { points: number }) {
  if (!points) return null;
  return (
    <m.span
      initial={{ scale: 0, rotate: -12 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', delay: 0.4 }}
      className="font-display inline-flex rounded-full bg-purple px-4 py-1 text-2xl font-bold text-peach"
    >
      {points > 0 ? '+' : ''}
      {points.toLocaleString()}
    </m.span>
  );
}

export function AudienceBadge() {
  return <span className="rounded-full bg-plum px-3 py-1 text-lg font-semibold text-mint">+ Audience</span>;
}
