import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAMES } from '@/games/registry';
import { loadPacks } from '@/games/__tests__/harness';
import type { ImposterState } from '@/games/imposter/logic';
import { DEFAULT_SETTINGS, type Action, type NoticeMessage, type PrivateMessage, type StateBroadcast } from '@/lib/types';
import { HostEngine, RECONNECT_GRACE_MS, TOURNAMENT_BREAK_MS, VIP_GRACE_MS, type HostSnapshot } from './hostEngine';
import type { HostBackend, HostTransport, StoredPlayer } from './transport';

const content = loadPacks(Object.values(GAMES).flatMap((g) => g.packs));

function makeRows(n: number): StoredPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    name: `P${i + 1}`,
    color: '#E086D3',
    token: `token-${i}`,
    isVip: i === 0,
    isAudience: false,
    joinedAt: `2026-09-27T00:00:0${i}Z`,
    gamesWon: 0,
    score: 0,
    connected: false,
  }));
}

function setup(rowCount = 3) {
  let rows = makeRows(rowCount);
  const broadcasts: StateBroadcast[] = [];
  const privates: { id: string; msg: PrivateMessage | NoticeMessage }[] = [];
  let actionHandler: (a: Action) => void = () => {};
  let presenceHandler: (ids: string[]) => void = () => {};
  const transport: HostTransport = {
    broadcastState: (m) => broadcasts.push(m),
    sendPrivate: (id, msg) => privates.push({ id, msg }),
    onAction: (h) => (actionHandler = h),
    onPresence: (h) => (presenceHandler = h),
    close: () => {},
  };
  const backend = {
    loadPlayers: vi.fn(async () => rows),
    deletePlayer: vi.fn(async (id: string) => {
      rows = rows.filter((r) => r.id !== id);
    }),
    updatePlayer: vi.fn(async () => {}),
    saveSnapshot: vi.fn(async () => {}),
    saveSettings: vi.fn(async () => {}),
    loadContent: vi.fn(async (packs: string[]) => Object.fromEntries(packs.map((p) => [p, content[p]]))),
  } satisfies HostBackend;
  const engine = new HostEngine(
    { transport, backend, clock: { now: () => Date.now(), toLocal: (ms) => ms }, modules: GAMES, onError: () => {} },
    { roomId: 'room-1', code: 'BCDF', settings: { ...DEFAULT_SETTINGS } },
  );
  const ids = rows.map((r) => r.id);
  const tokenOf = (id: string) => `token-${ids.indexOf(id)}`;
  const act = async (a: Record<string, unknown> & { type: string; playerId: string }) => {
    await engine.handleAction({ token: tokenOf(a.playerId), ...a });
  };
  return {
    engine,
    backend,
    broadcasts,
    privates,
    ids,
    act,
    presence: (list: string[]) => presenceHandler(list),
    send: (a: Action) => actionHandler(a),
    addRow: (row: StoredPlayer) => (rows = [...rows, row]),
    last: () => broadcasts[broadcasts.length - 1],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

async function startGame(t: ReturnType<typeof setup>, slug: keyof typeof GAMES) {
  await t.engine.start();
  t.presence(t.ids);
  await t.act({ type: 'VIP_SELECT_GAME', playerId: t.ids[0], game: slug });
  await t.act({ type: 'VIP_START', playerId: t.ids[0] });
}

describe('HostEngine', () => {
  it('shows players from presence and makes the first player VIP (FR-2, FR-3)', async () => {
    const t = setup(3);
    await t.engine.start();
    t.presence(t.ids);
    const room = t.last().room;
    expect(room.players.map((p) => p.connected)).toEqual([true, true, true]);
    expect(room.vipId).toBe(t.ids[0]);
  });

  it('picks up a brand-new player as soon as their presence appears', async () => {
    const t = setup(2);
    await t.engine.start();
    t.presence(t.ids);
    const newcomer = { ...makeRows(3)[2] };
    t.addRow(newcomer);
    t.presence([...t.ids, newcomer.id]);
    await vi.waitFor(() => expect(t.last().room.players).toHaveLength(3));
  });

  it('ignores actions with a bad token and non-VIP game controls', async () => {
    const t = setup(3);
    await t.engine.start();
    t.presence(t.ids);
    await t.engine.handleAction({ type: 'VIP_SELECT_GAME', playerId: t.ids[0], token: 'wrong', game: 'imposter' });
    expect(t.engine.getState().selectedGame).toBeNull();
    await t.act({ type: 'VIP_SELECT_GAME', playerId: t.ids[1], game: 'imposter' });
    expect(t.engine.getState().selectedGame).toBeNull();
    await t.act({ type: 'VIP_SELECT_GAME', playerId: t.ids[0], game: 'imposter' });
    expect(t.engine.getState().selectedGame).toBe('imposter');
  });

  it('rate-limits a player to 5 actions per second', async () => {
    const t = setup(2);
    await t.engine.start();
    t.presence(t.ids);
    const before = t.broadcasts.length;
    for (let i = 0; i < 8; i++) await t.act({ type: 'HELLO', playerId: t.ids[1] });
    expect(t.broadcasts.length - before).toBe(5);
    vi.advanceTimersByTime(1100);
    await t.act({ type: 'HELLO', playerId: t.ids[1] });
    expect(t.broadcasts.length - before).toBe(6);
  });

  it('starts a game, sends private views privately, and never broadcasts secrets (FR-6)', async () => {
    const t = setup(4);
    await startGame(t, 'imposter');
    vi.advanceTimersByTime(8_000); // intro -> secret
    const state = t.engine.getState().game!.state as ImposterState;
    expect(state.phase).toBe('secret');
    const word = state.rounds[0].word;
    for (const b of t.broadcasts) {
      expect(JSON.stringify(b)).not.toContain(`"${word}"`);
      expect(JSON.stringify(b)).not.toContain('"imposter":');
    }
    const words = t.privates.filter((p) => p.msg.type === 'PRIVATE').map((p) => JSON.stringify(p.msg));
    expect(words.some((w) => w.includes(word))).toBe(true);
  });

  it('rejects stale submissions and advances when everyone has submitted (FR-7)', async () => {
    const t = setup(4);
    await startGame(t, 'most-likely-to');
    vi.advanceTimersByTime(7_000); // intro timer
    const g = t.engine.getState().game!;
    expect(g.state.phase).toBe('vote');
    const step = g.state.step;
    await t.act({ type: 'VOTE', playerId: t.ids[1], round: step - 1, choiceId: t.ids[0] });
    expect(t.engine.getState().game!.state.submitted).toEqual([]);
    for (const id of t.ids) await t.act({ type: 'VOTE', playerId: id, round: step, choiceId: t.ids[0] });
    expect(t.engine.getState().game!.state.phase).toBe('reveal');
  });

  it('auto-advances when the server-synced timer ends', async () => {
    const t = setup(3);
    await startGame(t, 'most-likely-to');
    vi.advanceTimersByTime(7_000);
    expect(t.engine.getState().game!.state.phase).toBe('vote');
    const endsAt = t.last().timerEndsAt!;
    expect(endsAt - Date.now()).toBe(20_000);
    vi.advanceTimersByTime(20_000);
    expect(t.engine.getState().game!.state.phase).toBe('reveal');
  });

  it('scales input timers by the timer-length setting', async () => {
    const t = setup(3);
    await t.engine.start();
    t.engine.updateSettings({ timerLength: 'extended' });
    t.presence(t.ids);
    await t.act({ type: 'VIP_SELECT_GAME', playerId: t.ids[0], game: 'most-likely-to' });
    await t.act({ type: 'VIP_START', playerId: t.ids[0] });
    vi.advanceTimersByTime(7_000);
    expect(t.last().timerEndsAt! - Date.now()).toBe(30_000);
  });

  it('pauses below 2 connected players and resumes when one returns (FR-10)', async () => {
    const t = setup(3);
    await startGame(t, 'most-likely-to');
    vi.advanceTimersByTime(7_000);
    t.presence([t.ids[0]]);
    expect(t.engine.getState().game!.paused).toBe(true);
    expect(t.last().paused).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(t.engine.getState().game!.state.phase).toBe('vote'); // timer frozen
    t.presence([t.ids[0], t.ids[1]]);
    expect(t.engine.getState().game!.paused).toBe(false);
    expect(t.last().timerEndsAt).not.toBeNull();
  });

  it('does not let a disconnected player block the step', async () => {
    const t = setup(3);
    await startGame(t, 'most-likely-to');
    vi.advanceTimersByTime(7_000);
    const step = t.engine.getState().game!.state.step;
    await t.act({ type: 'VOTE', playerId: t.ids[0], round: step, choiceId: t.ids[1] });
    await t.act({ type: 'VOTE', playerId: t.ids[1], round: step, choiceId: t.ids[1] });
    expect(t.engine.getState().game!.state.phase).toBe('vote');
    t.presence([t.ids[0], t.ids[1]]);
    expect(t.engine.getState().game!.state.phase).toBe('reveal');
  });

  it('passes VIP to the next-oldest player when the VIP leaves', async () => {
    const t = setup(3);
    await t.engine.start();
    t.presence(t.ids);
    t.presence([t.ids[1], t.ids[2]]);
    vi.advanceTimersByTime(VIP_GRACE_MS + 5_000);
    expect(t.engine.getState().vipId).toBe(t.ids[1]);
    expect(t.backend.updatePlayer).toHaveBeenCalledWith(t.ids[1], { is_vip: true });
  });

  it('keeps a dropped seat for 5 minutes, then frees it (FR-8)', async () => {
    const t = setup(3);
    await t.engine.start();
    t.presence(t.ids);
    t.presence([t.ids[0], t.ids[1]]);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS - 10_000);
    expect(t.engine.getState().players).toHaveLength(3);
    vi.advanceTimersByTime(20_000);
    expect(t.backend.deletePlayer).toHaveBeenCalledWith(t.ids[2]);
    expect(t.engine.getState().players).toHaveLength(2);
  });

  it('lets the VIP kick a player (FR-13)', async () => {
    const t = setup(3);
    await t.engine.start();
    t.presence(t.ids);
    await t.act({ type: 'VIP_KICK', playerId: t.ids[0], targetId: t.ids[2] });
    expect(t.privates.some((p) => p.id === t.ids[2] && p.msg.type === 'NOTICE')).toBe(true);
    expect(t.engine.getState().players.map((p) => p.id)).toEqual(t.ids.slice(0, 2));
  });

  it('lets the VIP skip a stuck phase', async () => {
    const t = setup(3);
    await startGame(t, 'most-likely-to');
    vi.advanceTimersByTime(7_000);
    await t.act({ type: 'VIP_SKIP', playerId: t.ids[0] });
    expect(t.engine.getState().game!.state.phase).toBe('reveal');
  });

  it('counts the audience as one combined bonus vote (FR-14)', async () => {
    const t = setup(4);
    t.addRow({ ...makeRows(5)[4], id: '00000000-0000-4000-8000-0000000000a1', token: 'aud', isAudience: true, isVip: false });
    await startGame(t, 'most-likely-to');
    vi.advanceTimersByTime(7_000);
    const step = t.engine.getState().game!.state.step;
    expect(t.last().audienceVote?.options).toHaveLength(4);
    await t.engine.handleAction({ type: 'VOTE', playerId: '00000000-0000-4000-8000-0000000000a1', token: 'aud', round: step, choiceId: t.ids[3] });
    expect(Object.keys(t.engine.getState().audienceVotes)).toHaveLength(1);
    await t.act({ type: 'VIP_SKIP', playerId: t.ids[0] });
    const state = t.engine.getState().game!.state as unknown as { audienceChoice: string | null };
    expect(state.audienceChoice).toBe(t.ids[3]);
  });

  it('snapshots and restores a game after a host refresh (FR-9)', async () => {
    const t = setup(3);
    await startGame(t, 'most-likely-to');
    vi.advanceTimersByTime(7_000 + 5_000);
    const snap = t.engine.snapshot();
    expect(snap.game?.remainingMs).toBe(15_000);
    const saved = JSON.parse(JSON.stringify(snap)) as HostSnapshot;
    t.engine.dispose();

    const t2 = setup(3);
    await t2.engine.start(saved);
    const g = t2.engine.getState().game!;
    expect(g.state).toEqual(saved.game!.state);
    expect(g.timerEndsAt! - Date.now()).toBe(15_000);
    expect(t2.last().seq).toBeGreaterThan(saved.seq);
  });

  it('records the winner in the session leaderboard (FR-15)', async () => {
    const t = setup(4);
    await startGame(t, 'most-likely-to');
    for (let i = 0; i < 400 && t.engine.getState().status === 'playing'; i++) {
      const g = t.engine.getState().game!;
      if (g.state.phase === 'vote') {
        // Players 0-2 agree every time; player 3 never does.
        for (const [k, id] of t.ids.entries()) await t.act({ type: 'VOTE', playerId: id, round: g.state.step, choiceId: t.ids[k === 3 ? 0 : 1] });
        vi.advanceTimersByTime(1100); // stay under the action rate limit
      } else vi.advanceTimersByTime(10_000);
    }
    const s = t.engine.getState();
    expect(s.status).toBe('results');
    expect(s.results!.winners.sort()).toEqual(t.ids.slice(0, 3).sort());
    expect(t.last().room.leaderboard.find((l) => l.id === t.ids[0])!.gamesWon).toBe(1);
    expect(t.backend.updatePlayer).toHaveBeenCalledWith(t.ids[0], expect.objectContaining({ games_won: 1 }));
  });

  describe('tournament mode', () => {
    /** VIP skips every phase of the current game until its results. */
    async function finishCurrentGame(t: ReturnType<typeof setup>) {
      for (let i = 0; i < 300 && t.engine.getState().status === 'playing'; i++) {
        await t.act({ type: 'VIP_SKIP', playerId: t.ids[0] });
        vi.advanceTimersByTime(250);
      }
      expect(t.engine.getState().status).toBe('results');
    }

    it('plays several games in a row and totals placement points', async () => {
      const t = setup(3);
      await t.engine.start();
      t.presence(t.ids);
      await t.act({ type: 'VIP_START_TOURNAMENT', playerId: t.ids[0], games: ['most-likely-to', 'emoji-decode'] });
      expect(t.engine.getState().game?.slug).toBe('most-likely-to');
      expect(t.last().room.tournament).toMatchObject({ index: 0, finished: false, games: ['most-likely-to', 'emoji-decode'] });

      await finishCurrentGame(t);
      const between = t.last().room.tournament!;
      expect(between.index).toBe(1);
      expect(between.nextGameAt! - Date.now()).toBeGreaterThan(TOURNAMENT_BREAK_MS - 1000);
      expect(between.standings.reduce((sum, s) => sum + s.points, 0)).toBeGreaterThan(0);

      // The next game starts on its own after the break.
      await vi.advanceTimersByTimeAsync(TOURNAMENT_BREAK_MS);
      expect(t.engine.getState().game?.slug).toBe('emoji-decode');

      await finishCurrentGame(t);
      const done = t.last().room.tournament!;
      expect(done.finished).toBe(true);
      expect(done.nextGameAt).toBeNull();
      expect(done.standings).toHaveLength(3);
    });

    it('lets the VIP start the next game early, and ending it returns to the lobby', async () => {
      const t = setup(2);
      await t.engine.start();
      t.presence(t.ids);
      await t.act({ type: 'VIP_START_TOURNAMENT', playerId: t.ids[0], games: ['most-likely-to', 'buzzer-blitz', 'imposter'] });
      await finishCurrentGame(t);
      vi.advanceTimersByTime(1100);
      await t.act({ type: 'VIP_START', playerId: t.ids[0] });
      expect(t.engine.getState().game?.slug).toBe('buzzer-blitz');
      await t.act({ type: 'VIP_LOBBY', playerId: t.ids[0] });
      expect(t.engine.getState().status).toBe('lobby');
      expect(t.last().room.tournament).toBeNull();
    });

    it('rejects a tournament with fewer than 2 valid games', async () => {
      const t = setup(2);
      await t.engine.start();
      t.presence(t.ids);
      await t.act({ type: 'VIP_START_TOURNAMENT', playerId: t.ids[0], games: ['imposter'] });
      await t.act({ type: 'VIP_START_TOURNAMENT', playerId: t.ids[0], games: ['imposter', 'not-a-game'] });
      expect(t.engine.getState().status).toBe('lobby');
      expect(t.privates.filter((p) => p.msg.type === 'NOTICE')).toHaveLength(2);
    });

    it('survives a host refresh between games', async () => {
      const t = setup(2);
      await t.engine.start();
      t.presence(t.ids);
      await t.act({ type: 'VIP_START_TOURNAMENT', playerId: t.ids[0], games: ['most-likely-to', 'emoji-decode'] });
      await finishCurrentGame(t);
      const saved = JSON.parse(JSON.stringify(t.engine.snapshot())) as HostSnapshot;
      t.engine.dispose();
      const t2 = setup(2);
      await t2.engine.start(saved);
      t2.presence(t2.ids);
      expect(t2.last().room.tournament?.index).toBe(1);
      await vi.advanceTimersByTimeAsync(TOURNAMENT_BREAK_MS);
      expect(t2.engine.getState().game?.slug).toBe('emoji-decode');
    });
  });

  it('shares the host color scheme with every phone', async () => {
    const t = setup(2);
    await t.engine.start();
    t.engine.updateSettings({ theme: { plum: '#141827', purple: '#5B5BD6', pink: '#F472B6', peach: '#E8EAF6', mint: '#7DD3C0' }, musicTrack: 3 });
    expect(t.last().room.settings.theme.plum).toBe('#141827');
    t.engine.updateSettings({ theme: { plum: 'red' } as never, musicTrack: 99 });
    expect(t.engine.getState().settings.theme.plum).toBe('#462749');
    expect(t.engine.getState().settings.musicTrack).toBe(1);
  });
});

