import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DrawingUploadProvider } from '@/components/shared/DrawingUpload';
import { MotionProvider } from '@/components/shared/MotionProvider';
import { GAMES } from '@/games/registry';
import { setDictionary } from '@/games/word-bomb/dictionary';
import type { BaseGameState, ControllerViewData, GameSlug, PublicPlayer } from '@/lib/types';
import { loadPacks, makePlayers, play, SETTINGS } from './harness';

const content = loadPacks(Object.values(GAMES).flatMap((g) => g.packs));

beforeAll(() => {
  setDictionary(fs.readFileSync(path.resolve(__dirname, '../../public/dict/words.txt'), 'utf8').split('\n').slice(0, 5000));
});

function wrap(node: ReactNode) {
  return (
    <MotionProvider>
      <DrawingUploadProvider upload={async () => 'https://example.supabase.co/x.png'}>{node}</DrawingUploadProvider>
    </MotionProvider>
  );
}

function viewFor(slug: GameSlug, state: BaseGameState, me: string): ControllerViewData {
  const gameModule = GAMES[slug];
  const players: PublicPlayer[] = state.players.map((p) => ({ ...p, isVip: false, connected: true, score: state.scores[p.id] ?? 0, inGame: true }));
  return {
    me,
    phase: state.phase,
    round: state.round,
    step: state.step,
    timerEndsAt: null,
    submitted: state.submitted.includes(me),
    submittedIds: state.submitted,
    publicData: gameModule.publicView(state),
    privateData: gameModule.privateView(state, me),
    players,
  };
}

describe.each(Object.keys(GAMES) as GameSlug[])('%s views', (slug) => {
  it('render every phase on the host and on phones (2 and 5 players)', () => {
    const gameModule = GAMES[slug];
    for (const n of [2, 5]) {
      const phases = new Set<string>();
      play(gameModule, gameModule.init(makePlayers(n), SETTINGS, content, n), null, {
        maxSteps: 120,
        onStep: (s) => {
          phases.add(s.phase);
          const HostView = gameModule.HostView;
          const host = render(wrap(<HostView state={s} />));
          expect(host.container.innerHTML.length).toBeGreaterThan(0);
          host.unmount();
          for (const p of s.players.slice(0, 2)) {
            const Controller = gameModule.ControllerView;
            const phone = render(wrap(<Controller view={viewFor(slug, s, p.id)} send={() => {}} />));
            expect(phone.container.innerHTML.length).toBeGreaterThan(0);
            phone.unmount();
          }
        },
      });
      expect(phases.size).toBeGreaterThan(1);
    }
  });
});

describe('controller interactions', () => {
  it('Punchline: typing an answer sends it for the right prompt', () => {
    const m = GAMES.punchline;
    const s = m.onTimerEnd(m.init(makePlayers(4), SETTINGS, content, 1));
    const me = s.players[0].id;
    const send = vi.fn();
    render(wrap(<m.ControllerView view={viewFor('punchline', s, me)} send={send} />));
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'a zinger' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const task = (m.privateView(s, me) as { tasks: { matchupId: string }[] }).tasks[0];
    expect(send).toHaveBeenCalledWith({ type: 'SUBMIT', payload: { matchupId: task.matchupId, text: 'a zinger' } });
  });

  it('Most Likely To: tapping a player sends a vote; after voting the phone shows who is done', () => {
    const m = GAMES['most-likely-to'];
    let s = m.onTimerEnd(m.init(makePlayers(4), SETTINGS, content, 2));
    const [me, other] = s.players.map((p: { id: string }) => p.id);
    const send = vi.fn();
    const { unmount } = render(wrap(<m.ControllerView view={viewFor('most-likely-to', s, me)} send={send} />));
    fireEvent.click(screen.getByRole('button', { name: /P2/ }));
    expect(send).toHaveBeenCalledWith({ type: 'VOTE', choiceId: other });
    unmount();
    s = m.onAction(s, { type: 'VOTE', playerId: me, round: s.step, choiceId: other });
    render(wrap(<m.ControllerView view={viewFor('most-likely-to', s, me)} send={send} />));
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument();
  });

  it('Bluff Buffet: your own lie is disabled when picking', () => {
    const m = GAMES['bluff-buffet'];
    let s = m.onTimerEnd(m.init(makePlayers(3), SETTINGS, content, 3));
    const me = s.players[0].id;
    s = m.onAction(s, { type: 'SUBMIT', playerId: me, round: s.step, payload: { text: 'my sneaky lie' } });
    s = m.onTimerEnd(s);
    render(wrap(<m.ControllerView view={viewFor('bluff-buffet', s, me)} send={() => {}} />));
    expect(screen.getByRole('button', { name: /my sneaky lie/ })).toBeDisabled();
  });

  it('Killer Quiz: an at-risk player must pick exactly 3 dice numbers', () => {
    const m = GAMES['killer-quiz'];
    let s = m.onTimerEnd(m.init(makePlayers(2), SETTINGS, content, 4));
    s = m.onTimerEnd(m.onTimerEnd(m.onTimerEnd(s))); // nobody answered -> at risk -> death intro -> dice
    expect(s.phase).toBe('dice');
    const me = s.players[0].id;
    const send = vi.fn();
    render(wrap(<m.ControllerView view={viewFor('killer-quiz', s, me)} send={send} />));
    const lock = screen.getByRole('button', { name: /Lock in/ });
    expect(lock).toBeDisabled();
    for (const n of ['1', '4', '6']) fireEvent.click(screen.getByRole('button', { name: n }));
    fireEvent.click(lock);
    expect(send).toHaveBeenCalledWith({ type: 'SUBMIT', payload: { picks: [1, 4, 6] } });
  });

  it('Buzzer Blitz: the buzzer sends a buzz on press', () => {
    const m = GAMES['buzzer-blitz'];
    const s = m.onTimerEnd(m.init(makePlayers(3), SETTINGS, content, 5));
    const send = vi.fn();
    render(wrap(<m.ControllerView view={viewFor('buzzer-blitz', s, s.players[0].id)} send={send} />));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'BUZZ' }));
    expect(send).toHaveBeenCalledWith({ type: 'SUBMIT', payload: { buzz: true } });
  });

  it('Imposter: the imposter sees no word, crew members do', () => {
    const m = GAMES.imposter;
    const s = m.onTimerEnd(m.onTimerEnd(m.init(makePlayers(4), SETTINGS, content, 6)));
    const state = s as unknown as { imposter: string; rounds: { word: string }[] };
    const crew = s.players.find((p: { id: string }) => p.id !== state.imposter)!.id;
    const a = render(wrap(<m.ControllerView view={viewFor('imposter', s, state.imposter)} send={() => {}} />));
    expect(screen.getByText(/You're the imposter/)).toBeInTheDocument();
    expect(a.container.textContent).not.toContain(state.rounds[0].word);
    a.unmount();
    render(wrap(<m.ControllerView view={viewFor('imposter', s, crew)} send={() => {}} />));
    expect(screen.getByText(state.rounds[0].word)).toBeInTheDocument();
  });
});
