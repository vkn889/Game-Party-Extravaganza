'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { ControllerViewProps, GameSlug } from '@/lib/types';

function Loading() {
  return <p className="py-10 text-center text-peach/80">Loading…</p>;
}

const load = (loader: () => Promise<{ default: ComponentType<ControllerViewProps> }>) =>
  dynamic(loader, { ssr: false, loading: Loading });

/**
 * Phone controllers, code-split per game so /play only downloads the game
 * being played (NFR-2) and never any host-side game logic or prompt data.
 */
export const CONTROLLERS: Record<GameSlug, ComponentType<ControllerViewProps>> = {
  punchline: load(() => import('./punchline/ControllerView')),
  'killer-quiz': load(() => import('./killer-quiz/ControllerView')),
  'stat-snoop': load(() => import('./stat-snoop/ControllerView')),
  'shirt-showdown': load(() => import('./shirt-showdown/ControllerView')),
  'hands-up-hoax': load(() => import('./hands-up-hoax/ControllerView')),
  imposter: load(() => import('./imposter/ControllerView')),
  'sketchy-lies': load(() => import('./sketchy-lies/ControllerView')),
  'bluff-buffet': load(() => import('./bluff-buffet/ControllerView')),
  'most-likely-to': load(() => import('./most-likely-to/ControllerView')),
  'doodle-telephone': load(() => import('./doodle-telephone/ControllerView')),
  'buzzer-blitz': load(() => import('./buzzer-blitz/ControllerView')),
  'emoji-decode': load(() => import('./emoji-decode/ControllerView')),
  'auction-chaos': load(() => import('./auction-chaos/ControllerView')),
  'word-bomb': load(() => import('./word-bomb/ControllerView')),
  'two-truths': load(() => import('./two-truths/ControllerView')),
};
