import { WifiOff } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { Counter } from '@/components/shared/Counter';
import { Timer } from '@/components/shared/Timer';

/** Avatar color, name and current score (PRD §2), plus the phase timer. */
export function TopBar({
  name,
  color,
  score,
  vip,
  timerEndsAt,
  reconnecting,
}: {
  name: string;
  color: string;
  score: number | null;
  vip: boolean;
  timerEndsAt: number | null;
  reconnecting: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b-4 border-plum-deep bg-plum px-4 py-3" style={{ borderColor: color }}>
      <Avatar name={name} color={color} vip={vip} />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="font-display truncate text-xl font-semibold">{name}</span>
        {score != null && (
          <span className="text-sm text-peach/85">
            <Counter value={score} /> pts
          </span>
        )}
      </div>
      {reconnecting && <WifiOff aria-label="Reconnecting" className="h-6 w-6 text-pink" />}
      <Timer endsAt={timerEndsAt} size="sm" />
    </header>
  );
}
