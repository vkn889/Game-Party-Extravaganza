'use client';

import type { ReactNode } from 'react';
import type { ControllerViewData, PublicPlayer } from '@/lib/types';

export function PhoneTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <h2 className="font-display text-2xl font-bold leading-tight">{children}</h2>
      {sub && <p className="text-base text-peach/85">{sub}</p>}
    </div>
  );
}

/** Pink "your turn" callout (PRD §4 reserves pink for time-sensitive moments). */
export function YourTurn({ children = "It's your turn!" }: { children?: ReactNode }) {
  return (
    <p role="status" className="font-display animate-your-turn mb-4 rounded-2xl bg-pink px-4 py-3 text-center text-xl font-bold text-plum">
      {children}
    </p>
  );
}

export function PromptBox({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-2xl bg-peach px-4 py-4 text-xl font-semibold text-plum shadow-card-sm">{children}</div>;
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-3 rounded-xl bg-plum-deep px-4 py-2 font-semibold text-pink">
      {message}
    </p>
  );
}

export function playerOf(view: ControllerViewData, id: string): PublicPlayer | undefined {
  return view.players.find((p) => p.id === id);
}

/** Typed accessors for a controller's view. */
export function pub<T>(view: ControllerViewData): T {
  return view.publicData as T;
}

export function priv<T>(view: ControllerViewData): T | null {
  return (view.privateData as T | null) ?? null;
}
