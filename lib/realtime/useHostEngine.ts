'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { clock } from '@/lib/engine/timers';
import { apiPost, ensureSession, getSupabase } from '@/lib/supabase/client';
import { normalizeSettings } from '@/lib/settings';
import type { GameSlug, RoomSettings } from '@/lib/types';
import { createHostBackend } from './hostBackend';
import { HostEngine, type AnyGameModule, type HostRoomState, type HostSnapshot } from './hostEngine';
import { storage } from './storage';
import { createHostTransport } from './supabaseTransport';

type Status = 'starting' | 'ready' | 'error';

interface RoomRow {
  id: string;
  code: string;
  settings: Partial<RoomSettings> | null;
  state_snapshot: HostSnapshot | null;
  status: string;
}

function mergeSettings(value: Partial<RoomSettings> | null | undefined): RoomSettings {
  return normalizeSettings(value);
}

async function findRoom(roomId: string): Promise<RoomRow | null> {
  const { data } = await getSupabase()
    .from('rooms')
    .select('id, code, settings, state_snapshot, status')
    .eq('id', roomId)
    .maybeSingle();
  return (data as RoomRow | null) ?? null;
}

/** Restores the stored room (FR-9) or creates a new one (FR-1). */
async function openRoom(forceNew: boolean): Promise<RoomRow> {
  await ensureSession();
  const stored = storage.getHost();
  if (stored && !forceNew) {
    let room = await findRoom(stored.roomId);
    if (!room) {
      // Same browser, new auth session: prove host ownership with the host secret.
      try {
        await apiPost('/api/rooms/claim', { code: stored.code, hostSecret: stored.hostSecret });
        room = await findRoom(stored.roomId);
      } catch {
        room = null;
      }
    }
    if (room && room.status !== 'ended') return { ...room, code: room.code.trim() };
  }
  const prefs = storage.getHostPrefs();
  const created = await apiPost<{ roomId: string; code: string; hostSecret: string; settings: RoomSettings }>(
    '/api/rooms',
    { settings: prefs ?? undefined },
  );
  storage.setHost({ code: created.code, roomId: created.roomId, hostSecret: created.hostSecret });
  return { id: created.roomId, code: created.code, settings: created.settings, state_snapshot: null, status: 'lobby' };
}

const EMPTY_SUBSCRIBE = () => () => {};

export function useHostEngine(modules: Partial<Record<GameSlug, AnyGameModule>>) {
  const [engine, setEngine] = useState<HostEngine | null>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const forceNew = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let created: HostEngine | null = null;
    setStatus('starting');
    setError(null);
    (async () => {
      try {
        const [room] = await Promise.all([openRoom(forceNew.current), clock.sync()]);
        forceNew.current = false;
        if (cancelled) return;
        const supabase = getSupabase();
        const transport = await createHostTransport(supabase.realtime, room.code);
        if (cancelled) {
          transport.close();
          return;
        }
        created = new HostEngine(
          { transport, backend: createHostBackend(supabase, room.id), clock, modules },
          { roomId: room.id, code: room.code, settings: mergeSettings(room.settings) },
        );
        await created.start(room.state_snapshot);
        if (cancelled) {
          created.dispose();
          return;
        }
        setEngine(created);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        created?.dispose();
        setError(e instanceof Error ? e.message : 'Could not start the room.');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      created?.dispose();
      setEngine(null);
    };
  }, [modules, attempt]);

  const state = useSyncExternalStore<HostRoomState | null>(
    engine ? (cb) => engine.subscribe(cb) : EMPTY_SUBSCRIBE,
    () => engine?.getState() ?? null,
    () => null,
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const newRoom = useCallback(() => {
    forceNew.current = true;
    setAttempt((n) => n + 1);
  }, []);

  return { engine, state, status, error, retry, newRoom };
}
