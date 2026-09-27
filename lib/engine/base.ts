import type { BaseGameState, Player, RoomSettings, StepTimer } from '@/lib/types';
import { filterText } from './filter';
import { rng, type Rand } from './rng';
import { sanitizeInput, DEFAULT_MAX_CHARS } from './text';

export function createBase(players: Player[], settings: RoomSettings, seed: number): BaseGameState {
  return {
    seed,
    phase: 'intro',
    round: 1,
    step: 0,
    timerNonce: 0,
    timer: { seconds: 6, kind: 'display' },
    players: players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    connected: players.map((p) => p.id),
    submitted: [],
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    settings,
  };
}

/** Moves to a new timed step: new phase, fresh submissions, new timer. */
export function goTo<S extends BaseGameState>(
  state: S,
  phase: string,
  timer: StepTimer | null,
  patch: Partial<S> = {},
): S {
  return {
    ...state,
    ...patch,
    phase,
    step: state.step + 1,
    submitted: [],
    timer,
  };
}

export const input = (seconds: number): StepTimer => ({ seconds, kind: 'input' });
export const display = (seconds: number): StepTimer => ({ seconds, kind: 'display' });
export const gameClock = (seconds: number, hidden = false): StepTimer => ({ seconds, kind: 'game', hidden });

export function randFor(state: BaseGameState, ...salt: (string | number)[]): Rand {
  return rng(state.seed, state.step, ...salt);
}

export function playerIds(state: BaseGameState): string[] {
  return state.players.map((p) => p.id);
}

export function isPlayer(state: BaseGameState, id: string): boolean {
  return state.players.some((p) => p.id === id);
}

export function playerName(state: BaseGameState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? 'Someone';
}

export function hasSubmitted(state: BaseGameState, id: string): boolean {
  return state.submitted.includes(id);
}

export function markSubmitted<S extends BaseGameState>(state: S, id: string): S {
  if (state.submitted.includes(id)) return state;
  return { ...state, submitted: [...state.submitted, id] };
}

/**
 * True when every connected player in `eligible` has submitted. Disconnected
 * players never block a step; the timer fills in their safe default.
 */
export function allConnectedSubmitted(state: BaseGameState, eligible: string[]): boolean {
  const waiting = eligible.filter((id) => state.connected.includes(id));
  return waiting.every((id) => state.submitted.includes(id));
}

export function addPoints(scores: Record<string, number>, id: string, points: number): Record<string, number> {
  if (!(id in scores)) return scores;
  return { ...scores, [id]: scores[id] + points };
}

/** Cleans a text submission: length cap and, in family mode, the profanity filter. */
export function cleanText(state: BaseGameState, value: unknown, maxChars = DEFAULT_MAX_CHARS): string {
  return filterText(sanitizeInput(value, maxChars), state.settings.familyFriendly);
}

/** The payload of a SUBMIT as a record, or an empty object. */
export function payloadOf(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}
