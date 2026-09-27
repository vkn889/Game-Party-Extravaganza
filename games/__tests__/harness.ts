import { DEFAULT_SETTINGS, type BaseGameState, type ContentItem, type ContentPacks, type GameAction, type GameModule, type Player, type RoomSettings } from '@/lib/types';
import fs from 'node:fs';
import path from 'node:path';

export function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    name: `P${i + 1}`,
    color: '#E086D3',
  }));
}

export const SETTINGS: RoomSettings = { ...DEFAULT_SETTINGS };

/** Loads the real prompt packs from content/prompts so tests also validate content. */
export function loadPacks(packs: string[]): ContentPacks {
  const out: ContentPacks = {};
  for (const pack of packs) {
    const file = path.resolve(__dirname, '../../content/prompts', `${pack}.json`);
    const items = JSON.parse(fs.readFileSync(file, 'utf8')) as (ContentItem & { family_friendly?: boolean })[];
    out[pack] = items.map(({ text, answer = null, decoys = null }) => ({ text, answer, decoys }));
  }
  return out;
}

export type Bot<S> = (state: S, playerId: string) => GameAction | null;

/**
 * Drives a game to the end: every step, each connected bot acts (if it wants
 * to), then the engine's rules apply: advance when complete, else the timer ends.
 */
export function play<S extends BaseGameState>(
  module: GameModule<S>,
  state: S,
  bot: Bot<S> | null,
  options: { maxSteps?: number; onStep?: (s: S) => void; actsPerStep?: number } = {},
): S {
  const maxSteps = options.maxSteps ?? 3000;
  let s = state;
  for (let i = 0; i < maxSteps && !module.isOver(s); i++) {
    options.onStep?.(s);
    if (bot) {
      for (let pass = 0; pass < (options.actsPerStep ?? 3); pass++) {
        for (const p of s.players) {
          if (!s.connected.includes(p.id)) continue;
          const action = bot(s, p.id);
          if (action) s = module.onAction(s, action);
          if (module.isOver(s)) return s;
        }
      }
    }
    s = module.onTimerEnd(s);
  }
  return s;
}

/** The step id every action must quote. */
export const r = (s: BaseGameState) => s.step;

const ROOM = '11111111-1111-4111-8111-111111111111';
let drawingCounter = 0;

/** A drawing URL that passes host validation for this player. */
export function drawingUrl(playerId: string): string {
  drawingCounter++;
  const file = `22222222-2222-4222-8222-${String(drawingCounter).padStart(12, '0')}`;
  return `https://example.supabase.co/storage/v1/object/public/drawings/${ROOM}/${playerId}/${file}.png`;
}
