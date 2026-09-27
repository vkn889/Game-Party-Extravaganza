'use client';

import { m } from 'framer-motion';
import { Maximize, PauseCircle, Settings, Users, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { GameBackdrop } from '@/components/shared/GameBackdrop';
import { GameIcon } from '@/components/shared/GameIcon';
import { ThemeStyle } from '@/components/shared/ThemeStyle';
import { Timer } from '@/components/shared/Timer';
import { GAME_META } from '@/games/meta';
import { GAMES } from '@/games/registry';
import { hostAudio } from '@/lib/audio';
import type { HostEngine, HostRoomState } from '@/lib/realtime/hostEngine';
import { storage } from '@/lib/realtime/storage';
import { useHostEngine } from '@/lib/realtime/useHostEngine';
import type { RoomSettings } from '@/lib/types';
import { Lobby } from './Lobby';
import { PlayerStrip } from './PlayerStrip';
import { Reactions } from './Reactions';
import { Results } from './Results';
import { SettingsPanel } from './SettingsPanel';

function useSoundCues(state: HostRoomState | null) {
  const prev = useRef<HostRoomState | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (!state || !before) return;
    if (state.players.length > before.players.length) hostAudio.play('join');
    if (state.status === 'playing' && before.status !== 'playing') hostAudio.play('start');
    if (state.status === 'results' && before.status !== 'results') hostAudio.play('win');
    const g = state.game;
    const bg = before.game;
    if (g && bg) {
      if (g.state.submitted.length > bg.state.submitted.length) hostAudio.play('submit');
      if (g.state.phase !== bg.state.phase) {
        if (g.state.phase === 'boom') hostAudio.play('boom');
        else if (g.state.phase === 'answer' && g.slug === 'buzzer-blitz') hostAudio.play('buzz');
        else if (/reveal|Reveal|sold|result|champion/.test(g.state.phase)) hostAudio.play('reveal');
      }
    }
  }, [state]);
}

function Stage({ engine, state }: { engine: HostEngine; state: HostRoomState }) {
  const [showSettings, setShowSettings] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const room = useMemo(() => engine.roomPublic(), [engine, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const joinUrl = `${origin}/join?code=${state.code}`;
  useSoundCues(state);

  useEffect(() => {
    hostAudio.setTrack(state.settings.musicTrack);
    hostAudio.setVolumes(state.settings.musicVolume, state.settings.sfxVolume);
  }, [state.settings.musicTrack, state.settings.musicVolume, state.settings.sfxVolume, soundOn]);

  function unlockSound() {
    if (soundOn) return;
    hostAudio.unlock();
    setSoundOn(true);
  }

  function changeSettings(patch: Partial<RoomSettings>) {
    engine.updateSettings(patch);
    storage.setHostPrefs({ ...state.settings, ...patch });
  }

  const g = state.game;
  const gameModule = g ? GAMES[g.slug] : null;
  const HostView = gameModule?.HostView;
  const vote = g && gameModule && state.settings.audience ? gameModule.audienceVote(g.state) : null;
  const audienceVotes = Object.keys(state.audienceVotes).length;

  return (
    <GameBackdrop slug={state.status === 'playing' ? (g?.slug ?? null) : null} className="flex min-h-dvh flex-col">
      <ThemeStyle theme={state.settings.theme} />
      <div className="flex min-h-dvh flex-col gap-6 px-10 py-6" onPointerDown={unlockSound}>
        <header className="flex items-center gap-6">
          <p className="font-display text-3xl font-bold">
            Game Party <span className="text-pink">Extravaganza</span>
          </p>
          {g && (
            <span className="flex items-center gap-3 rounded-full bg-plum-raised px-5 py-2">
              <GameIcon slug={g.slug} className="h-7 w-7 text-pink" />
              <span className="font-display text-2xl font-semibold">{GAME_META[g.slug].name}</span>
            </span>
          )}
          {room.tournament && (
            <span className="font-display rounded-full bg-purple px-4 py-2 text-xl font-semibold text-peach">
              Tournament · {room.tournament.finished ? 'Final results' : `Game ${room.tournament.index + 1} of ${room.tournament.games.length}`}
            </span>
          )}
          <div className="ml-auto flex items-center gap-4">
            {g && <Timer endsAt={g.state.timer?.hidden ? null : g.timerEndsAt} size="lg" />}
            {state.status !== 'lobby' && (
              <span className="font-display rounded-2xl bg-plum-raised px-5 py-2 text-3xl font-bold tracking-widest" aria-label={`Room code ${state.code}`}>
                {state.code}
              </span>
            )}
            {room.audienceCount > 0 && (
              <span className="flex items-center gap-2 text-xl text-mint" title="Audience">
                <Users aria-hidden className="h-6 w-6" /> {room.audienceCount}
              </span>
            )}
            {!soundOn && (
              <button type="button" onClick={unlockSound} className="flex min-h-12 items-center gap-2 rounded-full px-4 text-lg ring-2 ring-peach/40 hover:bg-plum-raised">
                <Volume2 aria-hidden className="h-6 w-6" /> Enable sound
              </button>
            )}
            <button
              type="button"
              aria-label="Full screen"
              onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
              className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-plum-raised"
            >
              <Maximize aria-hidden className="h-6 w-6" />
            </button>
            <button type="button" aria-label="Settings" onClick={() => setShowSettings(true)} className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-plum-raised">
              <Settings aria-hidden className="h-7 w-7" />
            </button>
          </div>
        </header>

        <main className="relative flex flex-1 flex-col items-center justify-center">
          {state.status === 'lobby' && <Lobby room={room} joinUrl={joinUrl} loading={state.loading} error={state.error} />}
          {state.status === 'results' && state.results && <Results results={state.results} room={room} />}
          {state.status === 'playing' && g && HostView && (
            <m.div key={g.slug} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full flex-1 items-center justify-center">
              <HostView state={g.state} />
            </m.div>
          )}
          {g?.paused && (
            <div role="status" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-3xl bg-plum/95">
              <PauseCircle aria-hidden className="h-24 w-24 text-pink" />
              <p className="font-display text-6xl font-bold">Waiting for players…</p>
              <p className="text-3xl text-peach/85">The game resumes when at least 2 players are connected.</p>
            </div>
          )}
        </main>

        {state.status === 'playing' && g && (
          <footer className="flex flex-col items-center gap-3">
            {vote && (
              <p className="text-xl text-mint" aria-live="polite">
                Audience: vote on your phone! {audienceVotes > 0 && `${audienceVotes} vote${audienceVotes === 1 ? '' : 's'} in`}
              </p>
            )}
            <PlayerStrip players={room.players} submittedIds={g.state.submitted} />
          </footer>
        )}
      </div>
      <Reactions engine={engine} />
      {showSettings && (
        <SettingsPanel
          settings={state.settings}
          onChange={changeSettings}
          onClose={() => setShowSettings(false)}
          onSkip={state.status === 'playing' ? () => engine.skipPhase() : undefined}
          onNewRoom={() => {
            storage.setHost(null);
            window.location.reload();
          }}
        />
      )}
    </GameBackdrop>
  );
}

export function HostApp() {
  const { engine, state, status, error, retry, newRoom } = useHostEngine(GAMES);

  if (status === 'error') {
    const anon = error?.includes('Anonymous sign-ins');
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="font-display text-5xl font-bold">We couldn&apos;t open a room</h1>
        <p className="max-w-xl text-xl text-peach/85">
          {anon ? 'Anonymous sign-ins are turned off for this Supabase project. Turn them on under Authentication → Sign In / Providers.' : error}
        </p>
        <div className="flex gap-4">
          <Button size="lg" onClick={retry}>
            Try again
          </Button>
          <Button size="lg" variant="ghost" onClick={newRoom}>
            Start a new room
          </Button>
        </div>
      </div>
    );
  }
  if (!engine || !state) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
        <m.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }} className="h-16 w-16 rounded-full border-8 border-purple border-t-pink" />
        <p className="font-display text-3xl">Setting up your room…</p>
      </div>
    );
  }
  return <Stage engine={engine} state={state} />;
}
