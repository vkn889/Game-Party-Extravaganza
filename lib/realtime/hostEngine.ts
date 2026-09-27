/**
 * The host engine: the single source of truth for a room (SRD §5).
 *
 * Phones send actions; the engine validates them (token, membership, phase,
 * one submission per step, rate limit), runs the pure game module, and
 * broadcasts public state to everyone plus private views to each player.
 * It also owns timers, pause/resume, VIP handover, reconnection grace and
 * Postgres snapshots so a refreshed host picks up where it left off.
 */
import { GAME_META, unsupportedReason } from '@/games/meta';
import { effectiveSeconds } from '@/lib/engine/timers';
import { newSeed } from '@/lib/engine/rng';
import { defaultWinners, plurality, rank } from '@/lib/engine/scoring';
import type {
  Action,
  BaseGameState,
  GameAction,
  GameModule,
  GameResults,
  GameSlug,
  NoticeMessage,
  Player,
  PublicPlayer,
  RoomPlayer,
  RoomPublic,
  RoomSettings,
  StateBroadcast,
  TournamentPublic,
} from '@/lib/types';
import { isGameSlug } from '@/lib/types';
import { REACTIONS } from '@/lib/reactions';
import { normalizeSettings } from '@/lib/settings';
import type { HostBackend, HostTransport, StoredPlayer } from './transport';

export const RECONNECT_GRACE_MS = 5 * 60_000; // FR-8
export const VIP_GRACE_MS = 20_000;
export const ACTION_LIMIT = 5; // actions per player per second (SRD §8)
export const RESUME_MIN_MS = 3_000;
const SNAPSHOT_DEBOUNCE_MS = 800;
const SWEEP_INTERVAL_MS = 5_000;
const MAX_CHAINED_ADVANCES = 50;
export const TOURNAMENT_BREAK_MS = 20_000;
export const MAX_TOURNAMENT_GAMES = 15;


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any>;

export interface ActiveGame {
  slug: GameSlug;
  state: BaseGameState;
  timerEndsAt: number | null; // server clock
  timerKey: string;
  paused: boolean;
  pausedRemainingMs: number | null;
}

export interface TournamentState {
  games: GameSlug[];
  /** The game being played, or the next one while between games. */
  index: number;
  points: Record<string, number>;
  names: Record<string, { name: string; color: string }>;
  finished: boolean;
  nextGameAt: number | null;
}

export interface HostRoomState {
  roomId: string;
  code: string;
  settings: RoomSettings;
  players: RoomPlayer[];
  vipId: string | null;
  selectedGame: GameSlug | null;
  status: 'lobby' | 'playing' | 'results';
  game: ActiveGame | null;
  tournament: TournamentState | null;
  results: GameResults | null;
  audienceVotes: Record<string, string>;
  disconnectedAt: Record<string, number>;
  seq: number;
  loading: boolean;
  error: string | null;
}

export interface HostSnapshot {
  version: 1;
  vipId: string | null;
  selectedGame: GameSlug | null;
  status: 'lobby' | 'playing' | 'results';
  results: GameResults | null;
  tournament?: TournamentState | null;
  seq: number;
  audienceVotes: Record<string, string>;
  game: { slug: GameSlug; state: BaseGameState; remainingMs: number | null } | null;
}

export interface EngineClock {
  now(): number; // server clock
  toLocal(serverMs: number): number;
}

export interface EngineDeps {
  transport: HostTransport;
  backend: HostBackend;
  clock: EngineClock;
  modules: Partial<Record<GameSlug, AnyGameModule>>;
  /** Injected for tests; defaults to the global timer functions. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  onError?: (error: unknown) => void;
}

export interface Reaction {
  id: number;
  emoji: string;
  color: string;
}

function timerKeyOf(state: BaseGameState): string {
  return `${state.step}:${state.timerNonce}`;
}

function byJoinOrder(a: RoomPlayer, b: RoomPlayer): number {
  return a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : a.id.localeCompare(b.id);
}

export class HostEngine {
  private s: HostRoomState;
  private readonly tokens = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly reactionListeners = new Set<(r: Reaction) => void>();
  private readonly lastPrivate = new Map<string, string>();
  private readonly actionLog = new Map<string, number[]>();
  private connectedIds = new Set<string>();
  private presenceReady = false;
  private timerHandle: unknown = null;
  private sweepHandle: unknown = null;
  private snapshotHandle: unknown = null;
  private breakHandle: unknown = null;
  private starting = false;
  private lookup: Promise<void> | null = null;
  private reactionSeq = 0;
  private disposed = false;

  constructor(
    private readonly deps: EngineDeps,
    init: { roomId: string; code: string; settings: RoomSettings },
  ) {
    this.s = {
      roomId: init.roomId,
      code: init.code,
      settings: init.settings,
      players: [],
      vipId: null,
      selectedGame: null,
      status: 'lobby',
      game: null,
      tournament: null,
      results: null,
      audienceVotes: {},
      disconnectedAt: {},
      seq: 0,
      loading: false,
      error: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(snapshot?: HostSnapshot | null): Promise<void> {
    await this.refreshPlayers();
    if (snapshot?.version === 1) await this.restore(snapshot);
    this.deps.transport.onAction((action) => {
      void this.handleAction(action);
    });
    this.deps.transport.onPresence((ids) => this.handlePresence(ids));
    this.sweepHandle = this.setIntervalFn(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.ensureVip();
    this.publish(true);
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.clearBreak();
    if (this.sweepHandle != null) this.clearIntervalFn(this.sweepHandle);
    if (this.snapshotHandle != null) this.clearTimeoutFn(this.snapshotHandle);
    this.deps.transport.close();
    this.listeners.clear();
    this.reactionListeners.clear();
  }

  getState(): HostRoomState {
    return this.s;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onReaction(listener: (r: Reaction) => void): () => void {
    this.reactionListeners.add(listener);
    return () => this.reactionListeners.delete(listener);
  }

  moduleFor(slug: GameSlug): AnyGameModule | undefined {
    return this.deps.modules[slug];
  }

  // ---------------------------------------------------------------------------
  // Host-screen controls
  // ---------------------------------------------------------------------------

  updateSettings(patch: Partial<RoomSettings>): void {
    const settings = normalizeSettings({ ...this.s.settings, ...patch });
    this.update({ settings });
    const g = this.s.game;
    if (g) {
      // Takes effect from the next step; the running timer keeps its end time.
      this.update({ game: { ...g, state: { ...g.state, settings } } });
    }
    this.deps.backend.saveSettings(settings).catch(this.reportError);
    this.publish();
  }

  /** Host-screen fallbacks for the VIP buttons. */
  skipPhase(): void {
    if (this.s.status === 'playing' && this.s.game && !this.s.game.paused) {
      this.advance();
      this.publish();
    }
  }

  // ---------------------------------------------------------------------------
  // Players and presence
  // ---------------------------------------------------------------------------

  async refreshPlayers(): Promise<void> {
    const rows = await this.deps.backend.loadPlayers();
    this.mergePlayers(rows);
  }

  private mergePlayers(rows: StoredPlayer[]): void {
    const previous = new Map(this.s.players.map((p) => [p.id, p]));
    this.tokens.clear();
    const players = rows
      .map((row): RoomPlayer => {
        this.tokens.set(row.id, row.token);
        const prev = previous.get(row.id);
        return {
          id: row.id,
          name: row.name,
          color: row.color,
          isVip: row.isVip,
          isAudience: row.isAudience,
          joinedAt: row.joinedAt,
          gamesWon: prev ? Math.max(prev.gamesWon, row.gamesWon) : row.gamesWon,
          score: prev?.score ?? row.score,
          connected: this.connectedIds.has(row.id),
        };
      })
      .sort(byJoinOrder);
    const vipFromDb = players.find((p) => p.isVip && !p.isAudience)?.id ?? null;
    this.update({ players, vipId: this.s.vipId && players.some((p) => p.id === this.s.vipId) ? this.s.vipId : vipFromDb });
  }

  /** Reloads players once when an unknown id shows up (a new join). */
  private lookupPlayers(): Promise<void> {
    if (!this.lookup) {
      this.lookup = this.refreshPlayers()
        .catch(this.reportError)
        .finally(() => {
          this.lookup = null;
        });
    }
    return this.lookup;
  }

  handlePresence(ids: string[]): void {
    const now = this.deps.clock.now();
    this.presenceReady = true;
    this.connectedIds = new Set(ids.filter((id) => id !== 'host'));
    const disconnectedAt = { ...this.s.disconnectedAt };
    let unknown = false;
    for (const id of this.connectedIds) {
      delete disconnectedAt[id];
      if (!this.s.players.some((p) => p.id === id)) unknown = true;
    }
    const players = this.s.players.map((p) => {
      const connected = this.connectedIds.has(p.id);
      if (!connected && p.connected) disconnectedAt[p.id] = now;
      if (!connected && disconnectedAt[p.id] == null) disconnectedAt[p.id] = now;
      return connected === p.connected ? p : { ...p, connected };
    });
    this.update({ players, disconnectedAt });
    this.syncGameConnectivity();
    this.ensureVip();
    this.publish();
    if (unknown) {
      void this.lookupPlayers().then(() => {
        const merged = this.s.players.map((p) => ({ ...p, connected: this.connectedIds.has(p.id) }));
        this.update({ players: merged });
        this.syncGameConnectivity();
        this.ensureVip();
        this.publish();
      });
    }
  }

  /** Drops players gone longer than the grace period and re-checks the VIP. */
  sweep(): void {
    const now = this.deps.clock.now();
    const expired = this.s.players.filter(
      (p) => !p.connected && this.s.disconnectedAt[p.id] != null && now - this.s.disconnectedAt[p.id] > RECONNECT_GRACE_MS,
    );
    for (const p of expired) this.removePlayer(p.id);
    const vipBefore = this.s.vipId;
    this.ensureVip();
    if (expired.length > 0 || vipBefore !== this.s.vipId) this.publish();
  }

  private removePlayer(id: string): void {
    this.deps.backend.deletePlayer(id).catch(this.reportError);
    this.tokens.delete(id);
    this.lastPrivate.delete(id);
    const disconnectedAt = { ...this.s.disconnectedAt };
    delete disconnectedAt[id];
    const audienceVotes = { ...this.s.audienceVotes };
    delete audienceVotes[id];
    this.update({
      players: this.s.players.filter((p) => p.id !== id),
      disconnectedAt,
      audienceVotes,
      vipId: this.s.vipId === id ? null : this.s.vipId,
    });
    this.syncGameConnectivity();
  }

  /** VIP passes to the oldest remaining connected player when the VIP leaves (FR-3). */
  ensureVip(): void {
    const now = this.deps.clock.now();
    const seated = this.s.players.filter((p) => !p.isAudience);
    const current = seated.find((p) => p.id === this.s.vipId);
    const currentOk =
      current &&
      (current.connected ||
        !this.presenceReady ||
        now - (this.s.disconnectedAt[current.id] ?? now) < VIP_GRACE_MS);
    if (currentOk) return;
    const next = seated.find((p) => p.connected && p.id !== this.s.vipId) ?? (current ? current : seated[0]);
    const nextId = next?.id ?? null;
    if (nextId === this.s.vipId) return;
    const oldId = this.s.vipId;
    this.update({
      vipId: nextId,
      players: this.s.players.map((p) => ({ ...p, isVip: p.id === nextId })),
    });
    if (oldId && this.s.players.some((p) => p.id === oldId)) {
      this.deps.backend.updatePlayer(oldId, { is_vip: false }).catch(this.reportError);
    }
    if (nextId) this.deps.backend.updatePlayer(nextId, { is_vip: true }).catch(this.reportError);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private rateLimited(playerId: string): boolean {
    const now = Date.now();
    const recent = (this.actionLog.get(playerId) ?? []).filter((t) => now - t < 1000);
    recent.push(now);
    this.actionLog.set(playerId, recent);
    return recent.length > ACTION_LIMIT;
  }

  async handleAction(raw: unknown): Promise<void> {
    if (this.disposed || !raw || typeof raw !== 'object') return;
    const action = raw as Action;
    if (typeof action.type !== 'string' || typeof action.playerId !== 'string' || typeof action.token !== 'string') {
      return;
    }
    if (this.rateLimited(action.playerId)) return;

    let player = this.s.players.find((p) => p.id === action.playerId);
    if (!player) {
      await this.lookupPlayers();
      player = this.s.players.find((p) => p.id === action.playerId);
    }
    if (!player || this.tokens.get(player.id) !== action.token) return;

    switch (action.type) {
      case 'HELLO':
        this.lastPrivate.delete(player.id);
        this.publish(player.id);
        return;
      case 'REACT':
        if ((REACTIONS as readonly string[]).includes(action.emoji)) {
          const reaction = { id: ++this.reactionSeq, emoji: action.emoji, color: player.color };
          this.reactionListeners.forEach((l) => l(reaction));
        }
        return;
      case 'SUBMIT':
      case 'VOTE':
        this.handleGameInput(player, action);
        return;
      default:
        break;
    }

    // Everything below is VIP-only (FR-4, FR-13).
    if (player.isAudience || player.id !== this.s.vipId) return;
    switch (action.type) {
      case 'VIP_SELECT_GAME':
        this.selectGame(action.game);
        return;
      case 'VIP_START':
        if (this.tournamentPending()) {
          await this.startNextTournamentGame(player.id);
        } else {
          if (this.s.status !== 'playing') this.update({ tournament: null });
          await this.startGame(this.s.selectedGame, player.id);
        }
        return;
      case 'VIP_START_TOURNAMENT':
        await this.startTournament(action.games, player.id);
        return;
      case 'VIP_SKIP':
        if (this.s.status === 'results') {
          if (this.tournamentPending()) await this.startNextTournamentGame(player.id);
          else this.backToLobby();
        } else {
          this.skipPhase();
        }
        return;
      case 'VIP_LOBBY':
        this.backToLobby();
        return;
      case 'VIP_KICK':
        this.kick(action.targetId, player.id);
        return;
    }
  }

  private notice(playerId: string, message: NoticeMessage): void {
    this.deps.transport.sendPrivate(playerId, message);
  }

  private seatedConnected(): RoomPlayer[] {
    return this.s.players.filter((p) => !p.isAudience && p.connected);
  }

  selectGame(game: unknown): void {
    if (this.s.status === 'playing' || !isGameSlug(game) || !this.deps.modules[game]) return;
    if (unsupportedReason(GAME_META[game], this.seatedConnected().length)) return;
    this.update({ selectedGame: game });
    this.publish();
  }

  kick(targetId: string, byId: string): void {
    if (targetId === byId || !this.s.players.some((p) => p.id === targetId)) return;
    this.notice(targetId, { type: 'NOTICE', kind: 'kicked', message: 'The VIP removed you from the room.' });
    this.removePlayer(targetId);
    this.ensureVip();
    this.publish();
  }

  backToLobby(): void {
    if (this.s.status === 'lobby') return;
    this.clearTimer();
    this.clearBreak();
    this.lastPrivate.clear();
    this.update({ status: 'lobby', game: null, audienceVotes: {}, tournament: null });
    this.publish();
  }

  // ---------------------------------------------------------------------------
  // Tournament mode: several games in a row, scored across all of them
  // ---------------------------------------------------------------------------

  /** True between games of a tournament that still has games left. */
  private tournamentPending(): boolean {
    const t = this.s.tournament;
    return Boolean(t && !t.finished && this.s.status === 'results');
  }

  async startTournament(games: unknown, requestedBy?: string): Promise<void> {
    if (this.s.status === 'playing' || this.starting) return;
    if (!Array.isArray(games)) return;
    const list = games.filter((g): g is GameSlug => isGameSlug(g) && Boolean(this.deps.modules[g])).slice(0, MAX_TOURNAMENT_GAMES);
    if (list.length < 2 || list.length !== games.length) {
      if (requestedBy) this.notice(requestedBy, { type: 'NOTICE', kind: 'error', message: 'Pick at least 2 games for a tournament.' });
      return;
    }
    this.clearBreak();
    this.update({ tournament: { games: list, index: 0, points: {}, names: {}, finished: false, nextGameAt: null } });
    await this.startGame(list[0], requestedBy);
    if (this.getState().status !== 'playing') this.update({ tournament: null });
    this.publish();
  }

  private async startNextTournamentGame(requestedBy?: string): Promise<void> {
    const t = this.s.tournament;
    if (!t || t.finished) return;
    this.clearBreak();
    this.update({ tournament: { ...t, nextGameAt: null } });
    await this.startGame(t.games[t.index], requestedBy);
    this.publish();
  }

  private scheduleNextTournamentGame(delayMs = TOURNAMENT_BREAK_MS): void {
    const t = this.s.tournament;
    if (!t || t.finished) return;
    this.clearBreak();
    this.update({ tournament: { ...t, nextGameAt: this.deps.clock.now() + delayMs } });
    this.breakHandle = this.setTimeoutFn(() => {
      this.breakHandle = null;
      if (this.tournamentPending()) void this.startNextTournamentGame();
    }, delayMs);
  }

  private clearBreak(): void {
    if (this.breakHandle != null) this.clearTimeoutFn(this.breakHandle);
    this.breakHandle = null;
  }

  /** Placement points: with n players, 1st place earns n, 2nd n-1, and so on (ties share). */
  private awardTournamentPoints(results: GameResults): void {
    const t = this.s.tournament;
    if (!t || t.finished) return;
    const n = results.standings.length;
    const points = { ...t.points };
    const names = { ...t.names };
    for (const s of results.standings) {
      const place = results.winners.includes(s.id) ? 1 : Math.max(results.winners.length ? 2 : 1, s.rank);
      points[s.id] = (points[s.id] ?? 0) + Math.max(1, n - place + 1);
      names[s.id] = { name: s.name, color: s.color };
    }
    const last = t.index + 1 >= t.games.length;
    this.update({ tournament: { ...t, points, names, finished: last, index: last ? t.index : t.index + 1, nextGameAt: null } });
    if (!last) this.scheduleNextTournamentGame();
  }

  tournamentPublic(): TournamentPublic | null {
    const t = this.s.tournament;
    if (!t) return null;
    const ids = Object.keys(t.names);
    return {
      games: t.games,
      index: t.index,
      finished: t.finished,
      nextGameAt: t.nextGameAt,
      standings: rank(t.points, ids).map((r) => ({ id: r.id, name: t.names[r.id].name, color: t.names[r.id].color, points: r.score, rank: r.rank })),
    };
  }

  async startGame(slug: GameSlug | null, requestedBy?: string): Promise<void> {
    if (this.starting || this.s.status === 'playing' || !slug) return;
    const gameModule = this.deps.modules[slug];
    if (!gameModule) return;
    const seated = this.seatedConnected();
    const reason = unsupportedReason(GAME_META[slug], seated.length);
    if (reason) {
      if (requestedBy) this.notice(requestedBy, { type: 'NOTICE', kind: 'error', message: reason });
      return;
    }
    this.starting = true;
    this.update({ loading: true, error: null });
    this.publish();
    try {
      await gameModule.prepare?.();
      const content = await this.deps.backend.loadContent(gameModule.packs, this.s.settings.familyFriendly);
      const missing = gameModule.packs.filter((p) => !content[p] || content[p].length === 0);
      if (missing.length > 0) throw new Error(`No prompts found for ${missing.join(', ')}`);
      const players: Player[] = seated.map((p) => ({ id: p.id, name: p.name, color: p.color }));
      const state = gameModule.init(players, this.s.settings, content, newSeed()) as BaseGameState;
      this.lastPrivate.clear();
      this.update({
        status: 'playing',
        selectedGame: slug,
        results: null,
        audienceVotes: {},
        game: { slug, state, timerEndsAt: null, timerKey: '', paused: false, pausedRemainingMs: null },
        players: this.s.players.map((p) => ({ ...p, score: 0 })),
      });
      this.restartTimer();
      this.syncGameConnectivity();
    } catch (error) {
      this.reportError(error);
      const message = 'Could not load that game. Check the connection and try again.';
      this.update({ error: message });
      if (requestedBy) this.notice(requestedBy, { type: 'NOTICE', kind: 'error', message });
    } finally {
      this.starting = false;
      this.update({ loading: false });
      this.publish();
      this.saveSnapshotNow();
    }
  }

  private handleGameInput(player: RoomPlayer, action: Extract<Action, { type: 'SUBMIT' | 'VOTE' }>): void {
    const g = this.s.game;
    if (this.s.status !== 'playing' || !g || g.paused) return;
    if (action.round !== g.state.step) return; // stale or duplicate: one submission per step
    const gameModule = this.deps.modules[g.slug];
    if (!gameModule) return;

    const inGame = g.state.players.some((p) => p.id === player.id);
    if (!inGame) {
      // Audience members and late joiners weigh in on vote phases (FR-14).
      if (action.type !== 'VOTE' || !this.s.settings.audience) return;
      const vote = gameModule.audienceVote(g.state);
      if (!vote || !vote.options.some((o) => o.id === action.choiceId)) return;
      this.update({ audienceVotes: { ...this.s.audienceVotes, [player.id]: action.choiceId } });
      this.publish();
      return;
    }

    const gameAction: GameAction =
      action.type === 'SUBMIT'
        ? { type: 'SUBMIT', playerId: player.id, round: action.round, payload: action.payload }
        : { type: 'VOTE', playerId: player.id, round: action.round, choiceId: String(action.choiceId) };
    const next = gameModule.onAction(g.state, gameAction) as BaseGameState;
    if (next === g.state) {
      // Private feedback may still have changed (an invalid word, for example).
      return;
    }
    this.setGameState(next);
    this.publish();
  }

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------

  private setGameState(next: BaseGameState, depth = 0): void {
    const g = this.s.game;
    if (!g) return;
    const gameModule = this.deps.modules[g.slug];
    if (!gameModule) return;
    const keyChanged = timerKeyOf(next) !== g.timerKey;
    const stepChanged = next.step !== g.state.step;
    this.update({
      game: { ...g, state: next },
      audienceVotes: stepChanged ? {} : this.s.audienceVotes,
      players: this.s.players.map((p) => (p.id in next.scores ? { ...p, score: next.scores[p.id] } : p)),
    });
    if (gameModule.isOver(next)) {
      this.finishGame();
      return;
    }
    if (keyChanged) this.restartTimer();
    if (!this.s.game?.paused && gameModule.isStepComplete(next) && depth < MAX_CHAINED_ADVANCES) {
      this.advance(depth + 1);
    }
  }

  /** Ends the current step: counts the audience's bonus vote, then runs onTimerEnd. */
  advance(depth = 0): void {
    const g = this.s.game;
    if (!g) return;
    const gameModule = this.deps.modules[g.slug];
    if (!gameModule) return;
    let state = g.state;
    const vote = gameModule.audienceVote(state);
    if (vote && this.s.settings.audience) {
      const counts: Record<string, number> = {};
      for (const choice of Object.values(this.s.audienceVotes)) counts[choice] = (counts[choice] ?? 0) + 1;
      const top = plurality(counts);
      if (top.length === 1 && vote.options.some((o) => o.id === top[0])) {
        state = gameModule.onAction(state, { type: 'AUDIENCE_VOTE', choiceId: top[0] });
      }
    }
    this.update({ audienceVotes: {} });
    state = gameModule.onTimerEnd(state);
    this.setGameState(state, depth);
  }

  private finishGame(): void {
    const g = this.s.game;
    if (!g) return;
    const gameModule = this.deps.modules[g.slug];
    const state = g.state;
    const ids = state.players.map((p) => p.id);
    const winners = (gameModule?.winners?.(state) ?? defaultWinners(state)).filter((id) => ids.includes(id));
    const standings = rank(state.scores, ids).map((r) => {
      const p = state.players.find((x) => x.id === r.id)!;
      return { ...r, name: p.name, color: p.color };
    });
    const players = this.s.players.map((p) => {
      if (!ids.includes(p.id)) return p;
      const won = winners.includes(p.id);
      const updated = { ...p, score: state.scores[p.id] ?? 0, gamesWon: p.gamesWon + (won ? 1 : 0) };
      this.deps.backend
        .updatePlayer(p.id, { score: updated.score, ...(won ? { games_won: updated.gamesWon } : {}) })
        .catch(this.reportError);
      return updated;
    });
    this.clearTimer();
    this.lastPrivate.clear();
    const results: GameResults = { game: g.slug, winners, standings };
    this.update({
      status: 'results',
      game: null,
      results,
      players,
      audienceVotes: {},
    });
    this.awardTournamentPoints(results);
    this.saveSnapshotNow();
  }

  private restartTimer(): void {
    this.clearTimer();
    const g = this.s.game;
    if (!g) return;
    const key = timerKeyOf(g.state);
    const seconds = effectiveSeconds(g.state.timer, this.s.settings);
    if (g.paused) {
      this.update({
        game: { ...g, timerKey: key, timerEndsAt: null, pausedRemainingMs: seconds == null ? null : seconds * 1000 },
      });
      return;
    }
    const timerEndsAt = seconds == null ? null : this.deps.clock.now() + seconds * 1000;
    this.update({ game: { ...g, timerKey: key, timerEndsAt } });
    this.scheduleTimer();
  }

  private scheduleTimer(): void {
    this.clearTimer();
    const g = this.s.game;
    if (!g || g.paused || g.timerEndsAt == null) return;
    const key = g.timerKey;
    const delay = Math.max(0, this.deps.clock.toLocal(g.timerEndsAt) - Date.now());
    this.timerHandle = this.setTimeoutFn(() => {
      this.timerHandle = null;
      const current = this.s.game;
      if (!current || current.timerKey !== key || current.paused) return;
      this.advance();
      this.publish();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timerHandle != null) this.clearTimeoutFn(this.timerHandle);
    this.timerHandle = null;
  }

  /** Mirrors presence into the game state and pauses below 2 connected players (FR-10). */
  private syncGameConnectivity(): void {
    const g = this.s.game;
    if (!g || this.s.status !== 'playing') return;
    const connected = g.state.players
      .filter((p) => this.connectedIds.has(p.id) && this.s.players.some((rp) => rp.id === p.id))
      .map((p) => p.id);
    const changed = connected.join() !== g.state.connected.join();
    let next: ActiveGame = changed ? { ...g, state: { ...g.state, connected } } : g;

    if (this.presenceReady) {
      const now = this.deps.clock.now();
      if (!next.paused && connected.length < 2) {
        this.clearTimer();
        next = {
          ...next,
          paused: true,
          pausedRemainingMs: next.timerEndsAt == null ? null : Math.max(0, next.timerEndsAt - now),
          timerEndsAt: null,
        };
      } else if (next.paused && connected.length >= 2) {
        next = {
          ...next,
          paused: false,
          timerEndsAt: next.pausedRemainingMs == null ? null : now + Math.max(next.pausedRemainingMs, RESUME_MIN_MS),
          pausedRemainingMs: null,
        };
      }
    }
    if (next === g) return;
    const resumed = g.paused && !next.paused;
    this.update({ game: next });
    if (resumed) this.scheduleTimer();
    // A disconnected player never blocks the step.
    const gameModule = this.deps.modules[next.slug];
    if (!next.paused && gameModule?.isStepComplete(next.state)) {
      this.advance();
    }
  }

  // ---------------------------------------------------------------------------
  // Broadcasting
  // ---------------------------------------------------------------------------

  roomPublic(): RoomPublic {
    const g = this.s.game;
    const inGame = new Set(g?.state.players.map((p) => p.id) ?? []);
    const players: PublicPlayer[] = this.s.players
      .filter((p) => !p.isAudience)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isVip: p.id === this.s.vipId,
        connected: p.connected,
        score: g ? (g.state.scores[p.id] ?? 0) : p.score,
        inGame: inGame.has(p.id),
      }));
    return {
      code: this.s.code,
      players,
      audienceCount: this.s.players.filter((p) => p.isAudience).length,
      vipId: this.s.vipId,
      selectedGame: this.s.selectedGame,
      settings: {
        familyFriendly: this.s.settings.familyFriendly,
        timerLength: this.s.settings.timerLength,
        audience: this.s.settings.audience,
        theme: this.s.settings.theme,
      },
      tournament: this.tournamentPublic(),
      hostConnected: true,
      leaderboard: this.s.players
        .filter((p) => !p.isAudience)
        .map((p) => ({ id: p.id, name: p.name, color: p.color, gamesWon: p.gamesWon }))
        .sort((a, b) => b.gamesWon - a.gamesWon),
    };
  }

  buildBroadcast(): StateBroadcast {
    const g = this.s.game;
    const room = this.roomPublic();
    if (this.s.status === 'playing' && g) {
      const gameModule = this.deps.modules[g.slug]!;
      const hidden = g.state.timer?.hidden === true;
      return {
        type: 'STATE',
        seq: this.s.seq,
        game: g.slug,
        phase: g.state.phase,
        round: g.state.round,
        step: g.state.step,
        timerEndsAt: hidden ? null : g.timerEndsAt,
        submittedIds: g.state.submitted,
        paused: g.paused,
        publicData: gameModule.publicView(g.state),
        audienceVote: this.s.settings.audience ? gameModule.audienceVote(g.state) : null,
        room,
      };
    }
    return {
      type: 'STATE',
      seq: this.s.seq,
      game: this.s.status === 'results' ? (this.s.results?.game ?? null) : null,
      phase: this.s.status === 'results' ? 'results' : this.s.loading ? 'loading' : 'lobby',
      round: 0,
      step: 0,
      timerEndsAt: null,
      submittedIds: [],
      paused: false,
      publicData: this.s.status === 'results' ? this.s.results : null,
      audienceVote: null,
      room,
    };
  }

  /**
   * Sends the latest state to everyone and changed private views to each
   * player. `force` resends private views (true for all, or one player id).
   */
  publish(force: boolean | string = false): void {
    if (this.disposed) return;
    this.update({ seq: Math.max(this.s.seq + 1, this.deps.clock.now()) });
    this.deps.transport.broadcastState(this.buildBroadcast());

    const g = this.s.game;
    if (this.s.status === 'playing' && g) {
      const gameModule = this.deps.modules[g.slug]!;
      for (const p of g.state.players) {
        if (!this.s.players.some((rp) => rp.id === p.id)) continue;
        const data = gameModule.privateView(g.state, p.id) ?? null;
        const json = JSON.stringify(data);
        if (force === true || force === p.id || this.lastPrivate.get(p.id) !== json) {
          this.lastPrivate.set(p.id, json);
          this.deps.transport.sendPrivate(p.id, { type: 'PRIVATE', seq: this.s.seq, data });
        }
      }
    }
    this.listeners.forEach((l) => l());
    this.scheduleSnapshot();
  }

  // ---------------------------------------------------------------------------
  // Snapshots (FR-9)
  // ---------------------------------------------------------------------------

  snapshot(): HostSnapshot {
    const g = this.s.game;
    const now = this.deps.clock.now();
    return {
      version: 1,
      vipId: this.s.vipId,
      selectedGame: this.s.selectedGame,
      status: this.s.status,
      results: this.s.results,
      tournament: this.s.tournament,
      seq: this.s.seq,
      audienceVotes: this.s.audienceVotes,
      game: g
        ? {
            slug: g.slug,
            state: g.state,
            remainingMs: g.paused ? g.pausedRemainingMs : g.timerEndsAt == null ? null : Math.max(0, g.timerEndsAt - now),
          }
        : null,
    };
  }

  private scheduleSnapshot(): void {
    if (this.snapshotHandle != null) return;
    this.snapshotHandle = this.setTimeoutFn(() => {
      this.snapshotHandle = null;
      this.saveSnapshotNow();
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  private saveSnapshotNow(): void {
    if (this.disposed) return;
    this.deps.backend
      .saveSnapshot({
        snapshot: this.snapshot(),
        status: this.s.status === 'playing' ? 'playing' : 'lobby',
        currentGame: this.s.game?.slug ?? null,
      })
      .catch(this.reportError);
  }

  private async restore(snap: HostSnapshot): Promise<void> {
    const now = this.deps.clock.now();
    this.update({
      vipId: snap.vipId && this.s.players.some((p) => p.id === snap.vipId) ? snap.vipId : this.s.vipId,
      selectedGame: snap.selectedGame,
      results: snap.results,
      tournament: snap.tournament ?? null,
      seq: snap.seq,
      audienceVotes: snap.audienceVotes ?? {},
      status: snap.status === 'playing' && !snap.game ? 'lobby' : snap.status,
    });
    // Between tournament games: give players time to reconnect, then carry on.
    if (snap.status === 'results' && snap.tournament && !snap.tournament.finished) this.scheduleNextTournamentGame();
    if (snap.status !== 'playing' || !snap.game) return;
    const gameModule = this.deps.modules[snap.game.slug];
    if (!gameModule) {
      this.update({ status: 'lobby' });
      return;
    }
    await gameModule.prepare?.();
    const state = snap.game.state;
    const remaining = snap.game.remainingMs;
    this.update({
      game: {
        slug: snap.game.slug,
        state,
        timerKey: timerKeyOf(state),
        timerEndsAt: remaining == null ? null : now + Math.max(remaining, RESUME_MIN_MS),
        paused: false,
        pausedRemainingMs: null,
      },
      players: this.s.players.map((p) => (p.id in state.scores ? { ...p, score: state.scores[p.id] } : p)),
    });
    this.scheduleTimer();
  }

  // ---------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------

  private update(patch: Partial<HostRoomState>): void {
    this.s = { ...this.s, ...patch };
  }

  private readonly reportError = (error: unknown): void => {
    if (this.deps.onError) this.deps.onError(error);
    else console.error('[host]', error);
  };

  private setTimeoutFn(fn: () => void, ms: number): unknown {
    return (this.deps.setTimeout ?? ((f, m) => setTimeout(f, m)))(fn, ms);
  }

  private clearTimeoutFn(handle: unknown): void {
    (this.deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(handle);
  }

  private setIntervalFn(fn: () => void, ms: number): unknown {
    return (this.deps.setInterval ?? ((f, m) => setInterval(f, m)))(fn, ms);
  }

  private clearIntervalFn(handle: unknown): void {
    (this.deps.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>)))(handle);
  }
}
