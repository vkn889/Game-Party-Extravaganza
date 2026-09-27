'use client';

import { useEffect, useState } from 'react';
import type { HostEngine, Reaction } from '@/lib/realtime/hostEngine';

/** Audience reactions float up the side of the stage. */
export function Reactions({ engine }: { engine: HostEngine }) {
  const [items, setItems] = useState<(Reaction & { left: number })[]>([]);
  useEffect(
    () =>
      engine.onReaction((r) => {
        setItems((list) => [...list.slice(-30), { ...r, left: 4 + Math.random() * 10 }]);
        window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== r.id)), 3300);
      }),
    [engine],
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-y-0 right-0 z-30 w-40 overflow-hidden">
      {items.map((r) => (
        <span key={r.id} className="animate-float-up absolute bottom-10 text-5xl" style={{ left: `${r.left * 8}px`, textShadow: `0 0 12px ${r.color}` }}>
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
