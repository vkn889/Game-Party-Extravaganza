import type { FC } from 'react';
import { DEFAULT_THEME, type Theme } from './theme';

export const GAME_SLUGS = [
  'punchline',
  'killer-quiz',
  'stat-snoop',
  'shirt-showdown',
  'hands-up-hoax',
  'imposter',
  'sketchy-lies',
  'bluff-buffet',
  'most-likely-to',
  'doodle-telephone',
  'buzzer-blitz',
  'emoji-decode',
  'auction-chaos',
  'word-bomb',
  'two-truths',
] as const;

export type GameSlug = (typeof GAME_SLUGS)[number];

export function isGameSlug(value: unknown): value is GameSlug {
  return typeof value === 'string' && (GAME_SLUGS as readonly string[]).includes(value);
}

export type TimerLength = 'normal' | 'extended' | 'off';

export interface RoomSettings {
  familyFriendly: boolean;
  timerLength: TimerLength;
  audience: boolean;
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  musicTrack: number; // 1..MUSIC_TRACKS.length
  theme: Theme;
}

/** Background music the host can choose from (public/music). */
export const MUSIC_TRACKS = [
  { id: 1, name: 'Party Starter', src: '/music/track-1.mp3' },
  { id: 2, name: 'Game Night', src: '/music/track-2.mp3' },
  { id: 3, name: 'Bright Lights', src: '/music/track-3.mp3' },
  { id: 4, name: 'Big Finale', src: '/music/track-4.mp3' },
  { id: 5, name: 'Late Night', src: '/music/track-5.mp3' },
] as const;

export const DEFAULT_SETTINGS: RoomSettings = {
  familyFriendly: true,
  timerLength: 'normal',
  audience: true,
  musicVolume: 0.4,
  sfxVolume: 0.7,
  musicTrack: 1,
  theme: DEFAULT_THEME,
};

/** A seat in a game: the subset of a room player that game logic needs. */
export interface Player {
  id: string;
  name: string;
  color: string;
}

/** A room member as the host tracks it. */
export interface RoomPlayer extends Player {
  isVip: boolean;
  isAudience: boolean;
  joinedAt: string;
  gamesWon: number;
  score: number;
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Messages (SRD §7)
// ---------------------------------------------------------------------------

/**
 * Phone to host, on room:{code}:host. `round` carries the step counter the
 * phone last saw, so the host can reject stale or duplicate submissions.
 */
export type Action =
  | { type: 'SUBMIT'; playerId: string; token: string; round: number; payload: unknown }
  | { type: 'VOTE'; playerId: string; token: string; round: number; choiceId: string }
  | { type: 'VIP_SELECT_GAME'; playerId: string; token: string; game: GameSlug }
  | { type: 'VIP_START' | 'VIP_SKIP' | 'VIP_LOBBY'; playerId: string; token: string }
  | { type: 'VIP_KICK'; playerId: string; token: string; targetId: string }
  | { type: 'VIP_START_TOURNAMENT'; playerId: string; token: string; games: GameSlug[] }
  | { type: 'HELLO'; playerId: string; token: string }
  | { type: 'REACT'; playerId: string; token: string; emoji: string };

/** Actions a game module receives: validated phone actions plus engine events. */
export type GameAction =
  | { type: 'SUBMIT'; playerId: string; round: number; payload: unknown }
  | { type: 'VOTE'; playerId: string; round: number; choiceId: string }
  /** Audience plurality for the current vote step, counted as one bonus vote. */
  | { type: 'AUDIENCE_VOTE'; choiceId: string };

export interface RoomPublic {
  code: string;
  players: PublicPlayer[];
  audienceCount: number;
  vipId: string | null;
  selectedGame: GameSlug | null;
  settings: Pick<RoomSettings, 'familyFriendly' | 'timerLength' | 'audience' | 'theme'>;
  tournament: TournamentPublic | null;
  hostConnected: boolean;
  leaderboard: { id: string; name: string; color: string; gamesWon: number }[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
  isVip: boolean;
  connected: boolean;
  score: number;
  inGame: boolean;
}

/** Host to everyone, on room:{code}. */
export interface StateBroadcast {
  type: 'STATE';
  seq: number; // increments each update; phones drop stale ones
  game: GameSlug | null;
  phase: string; // 'lobby' | 'results' | 'paused' | a game phase
  round: number;
  step: number;
  timerEndsAt: number | null; // epoch ms (server clock); phones count down locally
  submittedIds: string[];
  paused: boolean;
  publicData: unknown; // game-specific, never contains secrets
  audienceVote: AudienceVote | null;
  room: RoomPublic;
}

/** Host to one player, on room:{code}:p:{id}. */
export interface PrivateMessage {
  type: 'PRIVATE';
  seq: number;
  data: unknown;
}

/** Host to one phone, on its private channel: kicks and rejected actions. */
export interface NoticeMessage {
  type: 'NOTICE';
  kind: 'kicked' | 'error';
  message: string;
}

/** A run of several games in a row, scored across all of them. */
export interface TournamentPublic {
  games: GameSlug[];
  /** Index of the game being played, or of the next game while between games. */
  index: number;
  standings: { id: string; name: string; color: string; points: number; rank: number }[];
  finished: boolean;
  /** Server-clock time the next game starts automatically, while between games. */
  nextGameAt: number | null;
}

/** Final standings shown on the results screen. */
export interface GameResults {
  game: GameSlug;
  winners: string[];
  standings: { id: string; name: string; color: string; score: number; rank: number }[];
}

export interface AudienceVote {
  prompt: string;
  options: { id: string; label: string }[];
}

// ---------------------------------------------------------------------------
// Game engine interface (SRD §7)
// ---------------------------------------------------------------------------

export type TimerKind =
  | 'input' // player input; scaled by the timer-length setting, removed when "off"
  | 'display' // reveals and results; always runs
  | 'game'; // part of the rules (a bomb fuse, an auction clock); always runs

export interface StepTimer {
  seconds: number;
  kind: TimerKind;
  /** Hide the countdown from screens (Word Bomb's random fuse). */
  hidden?: boolean;
}

/** Fields every game state carries so the engine can run timers and scoring. */
export interface BaseGameState {
  seed: number;
  phase: string;
  round: number;
  /** Increments on every timed transition. Actions must quote the current step. */
  step: number;
  /** Bump to restart the current timer without a new step (auction bids). */
  timerNonce: number;
  timer: StepTimer | null;
  players: Player[];
  /** Maintained by the engine: ids of seated players whose phones are connected. */
  connected: string[];
  submitted: string[];
  scores: Record<string, number>;
  settings: RoomSettings;
}

export interface ContentItem {
  text: string;
  answer?: string | null;
  decoys?: string[] | null;
}

/** Prompt packs keyed by pack name (usually the game slug). */
export type ContentPacks = Record<string, ContentItem[]>;

export interface HostViewProps<S> {
  state: S;
}

export interface ControllerViewProps {
  view: ControllerViewData;
  send: (action: ControllerAction) => void;
}

/** What a phone renders for a game: public + its own private view. */
export interface ControllerViewData {
  me: string;
  phase: string;
  round: number;
  step: number;
  timerEndsAt: number | null;
  submitted: boolean;
  submittedIds: string[];
  publicData: unknown;
  privateData: unknown;
  players: PublicPlayer[];
}

/** Actions a controller view can send; the page adds playerId, token and round. */
export type ControllerAction =
  | { type: 'SUBMIT'; payload: unknown }
  | { type: 'VOTE'; choiceId: string };

export interface GameModule<S extends BaseGameState> {
  slug: GameSlug;
  name: string;
  minPlayers: 2;
  maxPlayers: 8;
  /** Content packs this game needs loaded before init. */
  packs: string[];
  /** Loads large static data (Word Bomb's dictionary) before init or restore. */
  prepare?(): Promise<void>;
  init(players: Player[], settings: RoomSettings, content: ContentPacks, seed: number): S;
  onAction(state: S, action: GameAction): S; // pure function, easy to unit test
  onTimerEnd(state: S): S;
  /** True when every connected player has acted and the step can end early. */
  isStepComplete(state: S): boolean;
  publicView(state: S): unknown; // what goes in StateBroadcast
  privateView(state: S, playerId: string): unknown | null;
  /** Vote options the audience can weigh in on during this step, if any. */
  audienceVote(state: S): AudienceVote | null;
  isOver(state: S): boolean;
  /** Winning player ids; defaults to the top score when omitted. */
  winners?(state: S): string[];
  HostView: FC<HostViewProps<S>>;
  ControllerView: FC<ControllerViewProps>;
}
