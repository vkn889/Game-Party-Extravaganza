'use client';

import { Check } from 'lucide-react';

export interface VoteOption {
  id: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  color?: string;
}

interface VoteGridProps {
  options: VoteOption[];
  selected?: string | null;
  onVote: (id: string) => void;
  columns?: 1 | 2;
  locked?: boolean;
  label?: string;
}

/** Big thumb-friendly choice buttons (48 px minimum, PRD §2). */
export function VoteGrid({ options, selected = null, onVote, columns = 1, locked = false, label = 'Choices' }: VoteGridProps) {
  return (
    <div role="group" aria-label={label} className={`grid gap-3 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {options.map((o) => {
        const isSelected = selected === o.id;
        const disabled = locked || o.disabled;
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => onVote(o.id)}
            className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3 text-left text-lg font-semibold transition-colors duration-200 disabled:cursor-not-allowed ${
              isSelected
                ? 'bg-pink text-plum shadow-card-sm'
                : o.disabled
                  ? 'bg-plum-deep text-peach/60'
                  : 'bg-peach text-plum shadow-card-sm hover:brightness-105'
            }`}
          >
            {o.color && <span aria-hidden className="h-5 w-5 shrink-0 rounded-full ring-2 ring-plum-deep" style={{ backgroundColor: o.color }} />}
            <span className="flex-1 break-words">
              {o.label}
              {(o.sublabel || (o.disabled && o.disabledReason)) && (
                <span className="block text-sm font-normal opacity-80">{o.disabled ? o.disabledReason : o.sublabel}</span>
              )}
            </span>
            {isSelected && <Check aria-hidden className="h-6 w-6 shrink-0" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}
