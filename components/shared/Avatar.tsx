import { Crown } from 'lucide-react';

interface AvatarProps {
  name: string;
  color: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  vip?: boolean;
  dimmed?: boolean;
}

const SIZES = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-11 w-11 text-lg',
  lg: 'h-16 w-16 text-2xl',
  xl: 'h-24 w-24 text-4xl',
};

/** A player's color disc with their initial; the crown marks the VIP. */
export function Avatar({ name, color, size = 'md', vip = false, dimmed = false }: AvatarProps) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';
  return (
    <span className={`relative inline-flex shrink-0 ${dimmed ? 'opacity-40 grayscale' : ''}`}>
      <span
        aria-hidden
        className={`font-display inline-flex items-center justify-center rounded-full font-bold text-plum ring-2 ring-plum-deep ${SIZES[size]}`}
        style={{ backgroundColor: color }}
      >
        {initial}
      </span>
      {vip && (
        <span className="absolute -top-2 -right-2 rounded-full bg-plum-deep p-0.5" title="VIP">
          <Crown aria-label="VIP" className="h-4 w-4 text-pink" strokeWidth={2.5} />
        </span>
      )}
    </span>
  );
}
