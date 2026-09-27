'use client';

import { m } from 'framer-motion';
import { Avatar } from './Avatar';
import { Counter } from './Counter';

export { Counter };

export interface ScoreRow {
  id: string;
  name: string;
  color: string;
  score: number;
}

export function Scoreboard({ rows, highlight = [], large = false }: { rows: ScoreRow[]; highlight?: string[]; large?: boolean }) {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  return (
    <ol className="flex w-full flex-col gap-3" aria-label="Scores">
      {sorted.map((row, i) => (
        <m.li
          layout
          key={row.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className={`flex items-center gap-4 rounded-2xl px-5 py-3 ${
            highlight.includes(row.id) ? 'bg-pink text-plum' : 'bg-plum-raised text-peach'
          }`}
        >
          <span className={`font-display w-8 text-center font-bold ${large ? 'text-3xl' : 'text-xl'}`}>{i + 1}</span>
          <Avatar name={row.name} color={row.color} size={large ? 'lg' : 'md'} />
          <span className={`font-display flex-1 truncate font-semibold ${large ? 'text-4xl' : 'text-2xl'}`}>{row.name}</span>
          <Counter value={row.score} className={`font-display font-bold ${large ? 'text-4xl' : 'text-2xl'}`} />
        </m.li>
      ))}
    </ol>
  );
}
