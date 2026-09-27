'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clock } from '@/lib/engine/timers';
import type { Action, ControllerAction, GameSlug, StateBroadcast } from '@/lib/types';
import { storage, type Seat } from './storage';
import type { PlayerTransport } from './transport';

/** Networking code loads after first paint so /play renders fast (NFR-2). */
const loadNet = () => Promise.all([import('@/lib/supabase/lite'), import('./supabaseTransport')]);

export type PhoneStatus = 'loading' | 'no-seat' | 'connecting' | 'connected' | 'reconnecting' | 'kicked' | 'error';

interface JoinResponse {
  room: { id: string; code: string };
  player: { id: string; name: string; color: string; token: string; isVip: boolean; isAudience: boolean };
}

export type VipAction =
  | { type: 'VIP_SELECT_GAME'; game: GameSlug }
  | { type: 'VIP_START' | 'VIP_SKIP' | 'VIP_LOBBY' }
  | { type: 'VIP_KICK'; targetId: string }
  | { type: 'VIP_START_TOURNAMENT'; games: GameSlug[] };

/**
 * The phone's connection to a room: rejoins its seat by token (FR-8), listens
 * for public state and its private channel, and sends actions to the host.
 */
export function useRoomChannel(code: string) {
  const [status, setStatus] = useState<PhoneStatus>('loading');
  const [seat, setSeat] = useState<Seat | null>(null);
  const [state, setState] = useState<StateBroadcast | null>(null);
  const [privateData, setPrivateData] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hostConnected, setHostConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const transportRef = useRef<PlayerTransport | null>(null);
  const seatRef = useRef<Seat | null>(null);
  const stepRef = useRef(0);
  const seqRef = useRef(0);
  const privateSeqRef = useRef(0);
  const gameRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stored = storage.getSeat(code);
    if (!stored) {
      setStatus('no-seat');
      return;
    }

    const hello = () => {
      const s = seatRef.current;
      if (s) transportRef.current?.send({ type: 'HELLO', playerId: s.playerId, token: s.token });
    };

    (async () => {
      try {
        const [lite, { createPlayerTransport }] = await loadNet();
        await lite.ensureSession();
        const [joined] = await Promise.all([
          lite.apiPost<JoinResponse>('/api/rooms/join', { code, token: stored.token }),
          clock.sync(),
        ]);
        if (cancelled) return;
        const current: Seat = {
          code,
          roomId: joined.room.id,
          playerId: joined.player.id,
          token: joined.player.token,
          name: joined.player.name,
          isAudience: joined.player.isAudience,
        };
        storage.setSeat(current);
        seatRef.current = current;
        setSeat(current);
        setStatus('connecting');

        const transport = await createPlayerTransport(lite.getLite().realtime, code, current.playerId, () => {
          // Ready (or rejoined after a drop): the host resends state and our private view.
          setTimeout(hello, 0);
        });
        if (cancelled) {
          transport.close();
          return;
        }
        transportRef.current = transport;
        transport.onState((message) => {
          if (message.seq <= seqRef.current) return; // drop stale broadcasts
          seqRef.current = message.seq;
          stepRef.current = message.step;
          if (message.game !== gameRef.current || message.phase === 'lobby' || message.phase === 'results') {
            if (message.game !== gameRef.current) {
              privateSeqRef.current = 0;
              setPrivateData(null);
            }
            gameRef.current = message.game;
          }
          setState(message);
        });
        transport.onPrivate((message) => {
          if (message.type === 'NOTICE') {
            if (message.kind === 'kicked') {
              storage.clearSeat(code);
              setStatus('kicked');
              transport.close();
            } else {
              setNotice(message.message);
            }
            return;
          }
          if (message.seq < privateSeqRef.current) return;
          privateSeqRef.current = message.seq;
          setPrivateData(message.data);
        });
        transport.onHostPresence(setHostConnected);
        transport.onStatus((s) => {
          if (s === 'connected') setStatus((prev) => (prev === 'kicked' ? prev : 'connected'));
          else if (s === 'disconnected') setStatus((prev) => (prev === 'kicked' ? prev : 'reconnecting'));
        });
        hello();
      } catch (e) {
        if (cancelled) return;
        const err = e as Error & { code?: string };
        if (err.code === 'seat_expired' || err.code === 'room_not_found') {
          storage.clearSeat(code);
          setError(err.code === 'room_not_found' ? 'That room has closed.' : 'Your seat expired. Join again.');
          setStatus('no-seat');
          return;
        }
        setError(err.message || 'Could not connect.');
        setStatus('error');
      }
    })();

    const onVisible = () => {
      if (document.visibilityState === 'visible') hello();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', hello);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', hello);
      transportRef.current?.close();
      transportRef.current = null;
    };
  }, [code]);

  const sendRaw = useCallback((action: Action) => {
    transportRef.current?.send(action);
  }, []);

  /** Game input from a controller view; tagged with the step it answers. */
  const send = useCallback(
    (action: ControllerAction) => {
      const s = seatRef.current;
      if (!s) return;
      const base = { playerId: s.playerId, token: s.token, round: stepRef.current };
      if (action.type === 'SUBMIT') sendRaw({ type: 'SUBMIT', payload: action.payload, ...base });
      else sendRaw({ type: 'VOTE', choiceId: action.choiceId, ...base });
    },
    [sendRaw],
  );

  const sendVip = useCallback(
    (action: VipAction) => {
      const s = seatRef.current;
      if (!s) return;
      sendRaw({ ...action, playerId: s.playerId, token: s.token } as Action);
    },
    [sendRaw],
  );

  const react = useCallback(
    (emoji: string) => {
      const s = seatRef.current;
      if (s) sendRaw({ type: 'REACT', emoji, playerId: s.playerId, token: s.token });
    },
    [sendRaw],
  );

  const leave = useCallback(async () => {
    const s = seatRef.current;
    storage.clearSeat(code);
    transportRef.current?.close();
    if (s) {
      try {
        const lite = await import('@/lib/supabase/lite');
        await lite.rest(`players?id=eq.${s.playerId}`, { method: 'DELETE' });
      } catch {
        // The host's reconnection grace removes the seat anyway.
      }
    }
  }, [code]);

  return {
    status,
    seat,
    state,
    privateData,
    notice,
    clearNotice: () => setNotice(null),
    hostConnected,
    error,
    send,
    sendVip,
    react,
    leave,
  };
}
