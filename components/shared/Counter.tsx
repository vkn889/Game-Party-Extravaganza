'use client';

import { useEffect, useRef } from 'react';

/** Counts a score up to its new value (instantly under reduced motion). No animation library needed. */
export function Counter({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = previous.current;
    previous.current = value;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from === value) {
      node.textContent = value.toLocaleString();
      return;
    }
    const start = performance.now();
    const duration = 900;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      node.textContent = Math.round(from + (value - from) * eased).toLocaleString();
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value.toLocaleString()}
    </span>
  );
}
