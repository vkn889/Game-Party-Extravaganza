import {
  BellRing,
  Bomb,
  Brush,
  Gavel,
  Hand,
  MessageSquareQuote,
  Percent,
  Phone,
  ScrollText,
  Shirt,
  Skull,
  Smile,
  Users,
  UtensilsCrossed,
  VenetianMask,
  type LucideIcon,
} from 'lucide-react';
import { GAME_META } from '@/games/meta';
import type { GameSlug } from '@/lib/types';

const ICONS: Record<string, LucideIcon> = {
  BellRing,
  Bomb,
  Brush,
  Gavel,
  Hand,
  MessageSquareQuote,
  Percent,
  Phone,
  ScrollText,
  Shirt,
  Skull,
  Smile,
  Users,
  UtensilsCrossed,
  VenetianMask,
};

export function GameIcon({ slug, className = 'h-6 w-6' }: { slug: GameSlug; className?: string }) {
  const Icon = ICONS[GAME_META[slug].icon] ?? Smile;
  return <Icon aria-hidden className={className} strokeWidth={2.25} />;
}
