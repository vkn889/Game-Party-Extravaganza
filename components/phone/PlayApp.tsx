'use client';

import { PauseCircle, SkipForward, TvMinimal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/shared/Button';
import { DrawingUploadProvider } from '@/components/shared/DrawingUpload';
import { GameIcon } from '@/components/shared/GameIcon';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { ThemeStyle } from '@/components/shared/ThemeStyle';
import { CONTROLLERS } from '@/games/controllers';
import { GAME_META } from '@/games/meta';
import { AUDIENCE_COLOR } from '@/lib/palette';
import { useRoomChannel } from '@/lib/realtime/useRoomChannel';
import type { ControllerViewData, GameResults, StateBroadcast } from '@/lib/types';
import { AudienceView } from './AudienceView';
import { PhoneLobby } from './PhoneLobby';
import { PhoneResults } from './PhoneResults';
import { TopBar } from './TopBar';

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">{children}</div>;
}

export function PlayApp({ code }: { code: string }) {
  const router = useRouter();
  const channel = useRoomChannel(code);
  const { status, seat, state, privateData, notice, clearNotice, hostConnected, error, send, sendVip, react, leave } = channel;
  const stateRef = useRef<StateBroadcast | null>(null);
  stateRef.current = state;

  useEffect(() => {
    if (status === 'no-seat') {
      const q = new URLSearchParams({ code });
      if (error) q.set('error', error);
      router.replace(`/join?${q.toString()}`);
    }
  }, [status, code, error, router]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(clearNotice, 4000);
    return () => window.clearTimeout(id);
  }, [notice, clearNotice]);

  // Drawings go to Supabase Storage; only the URL travels over Realtime (SRD §5).
  const upload = useCallback(
    async (png: Blob) => {
      if (!seat) throw new Error('Not in a room');
      const lite = await import('@/lib/supabase/lite');
      const path = `${seat.roomId}/${seat.playerId}/${crypto.randomUUID()}.png`;
      const url = await lite.uploadDrawing(path, png);
      const s = stateRef.current;
      void lite
        .rest('submissions', {
          method: 'POST',
          body: JSON.stringify({ room_id: seat.roomId, player_id: seat.playerId, game: s?.game ?? 'unknown', round: s?.round ?? 0, kind: 'drawing', content: { path, url } }),
        })
        .catch(() => undefined);
      return url;
    },
    [seat],
  );

  const me = seat && state ? state.room.players.find((p) => p.id === seat.playerId) : undefined;

  const view = useMemo<ControllerViewData | null>(() => {
    if (!state || !seat) return null;
    return {
      me: seat.playerId,
      phase: state.phase,
      round: state.round,
      step: state.step,
      timerEndsAt: state.timerEndsAt,
      submitted: state.submittedIds.includes(seat.playerId),
      submittedIds: state.submittedIds,
      publicData: state.publicData,
      privateData,
      players: state.room.players,
    };
  }, [state, seat, privateData]);

  if (status === 'kicked') {
    return (
      <Centered>
        <p className="font-display text-3xl font-bold">You were removed from the room.</p>
        <Button size="lg" onClick={() => router.replace(`/join?code=${code}`)}>
          Join again
        </Button>
      </Centered>
    );
  }
  if (status === 'error') {
    return (
      <Centered>
        <p className="font-display text-3xl font-bold">Couldn&apos;t connect</p>
        <p className="text-peach/85">{error}</p>
        <Button size="lg" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Centered>
    );
  }
  if (!seat || !state || !view) {
    return (
      <Centered>
        <span aria-hidden className="h-12 w-12 animate-spin rounded-full border-[6px] border-purple border-t-pink" />
        <p className="font-display text-2xl">Joining room {code}…</p>
      </Centered>
    );
  }

  const isAudience = seat.isAudience;
  const isVip = state.room.vipId === seat.playerId;
  const inGame = Boolean(me?.inGame);
  const Controller = state.game ? CONTROLLERS[state.game] : null;
  const playing = state.game && !['lobby', 'results', 'loading'].includes(state.phase);

  let body: React.ReactNode;
  if (state.phase === 'loading') {
    body = <LookAtScreen title="Starting the game…" />;
  } else if (state.phase === 'results' && state.publicData) {
    body = <PhoneResults results={state.publicData as GameResults} room={state.room} me={seat.playerId} isVip={isVip} sendVip={sendVip} />;
  } else if (isAudience || (playing && !inGame)) {
    body = (
      <AudienceView
        vote={state.audienceVote}
        step={state.step}
        title={isAudience ? "You're in the audience!" : "You'll join the next game."}
        onVote={(id) => send({ type: 'VOTE', choiceId: id })}
        onReact={react}
      />
    );
  } else if (state.phase === 'lobby') {
    body = (
      <PhoneLobby
        room={state.room}
        me={seat.playerId}
        sendVip={sendVip}
        onLeave={async () => {
          await leave();
          router.replace('/');
        }}
      />
    );
  } else if (state.paused) {
    body = (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <PauseCircle aria-hidden className="h-16 w-16 text-pink" />
        <p className="font-display text-2xl font-bold">Waiting for players to reconnect…</p>
      </div>
    );
  } else if (Controller) {
    body = <Controller view={view} send={send} />;
  } else {
    body = <LookAtScreen />;
  }

  return (
    <DrawingUploadProvider upload={upload}>
      <ThemeStyle theme={state.room.settings.theme} />
      <div className="flex min-h-dvh flex-col">
        <TopBar
          name={seat.name}
          color={me?.color ?? AUDIENCE_COLOR}
          score={me ? me.score : null}
          vip={isVip}
          timerEndsAt={playing && !state.paused ? state.timerEndsAt : null}
          reconnecting={status === 'reconnecting'}
        />
        {!hostConnected && (
          <p role="status" className="flex items-center gap-2 bg-plum-deep px-4 py-2 text-sm">
            <TvMinimal aria-hidden className="h-4 w-4 text-pink" /> Waiting for the host screen…
          </p>
        )}
        {state.game && playing && (
          <p className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold text-mint">
            <GameIcon slug={state.game} className="h-4 w-4" /> {GAME_META[state.game].name}
            {state.room.tournament && (
              <span className="ml-auto text-peach/80">
                Tournament {state.room.tournament.index + 1}/{state.room.tournament.games.length}
              </span>
            )}
          </p>
        )}
        <main className="flex-1 px-4 py-4">{body}</main>
        {isVip && playing && (
          <div className="flex justify-end gap-2 px-4 pb-4">
            <button
              type="button"
              onClick={() => sendVip({ type: 'VIP_SKIP' })}
              className="flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-semibold ring-1 ring-peach/40"
            >
              <SkipForward aria-hidden className="h-4 w-4" /> Skip phase
            </button>
          </div>
        )}
        <div role="alert" className="fixed inset-0 z-50 hidden flex-col items-center justify-center gap-3 bg-plum px-6 text-center phone-landscape:flex">
          <p className="font-display text-2xl font-bold">Turn your phone upright</p>
          <p className="text-peach/85">The controller works in portrait.</p>
        </div>
        {notice && (
          <p role="alert" className="fixed inset-x-4 bottom-4 z-30 rounded-2xl bg-pink px-4 py-3 text-center font-semibold text-plum shadow-card">
            {notice}
          </p>
        )}
      </div>
    </DrawingUploadProvider>
  );
}
