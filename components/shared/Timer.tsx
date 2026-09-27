'use client';

import { useEffect, useState } from 'react';
import { clock, secondsLeft } from '@/lib/engine/timers';

interface TimerProps {
  endsAt: number | null;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

/**
 * Countdown to a server-clock instant (FR-7). Pink, because it's time-sensitive (PRD §4).
 * Every screen counts down locally from the same timerEndsAt.
 */
export function Timer({ endsAt, size = 'md', label = 'Time left' }: TimerProps) {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    if (endsAt == null) return;
    const id = window.setInterval(() => setNow(clock.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const left = secondsLeft(endsAt, now);
  if (left == null) return null;
  const urgent = left <= 5;
  const dims = size === 'lg' ? 'h-24 w-24 text-5xl' : size === 'md' ? 'h-14 w-14 text-2xl' : 'h-10 w-10 text-lg';
  return (
    <div
      role="timer"
      aria-label={`${label}: ${left} seconds`}
      className={`font-display inline-flex items-center justify-center rounded-full border-4 border-pink font-bold tabular-nums ${dims} ${
        urgent ? 'animate-your-turn bg-pink text-plum' : 'bg-plum-deep text-pink'
      }`}
    >
      {left}
    </div>
  );
}
