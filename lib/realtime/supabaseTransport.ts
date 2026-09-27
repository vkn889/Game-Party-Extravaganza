'use client';

import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js';
import type { Action, NoticeMessage, PrivateMessage, StateBroadcast } from '@/lib/types';
import type { HostTransport, PlayerTransport } from './transport';

/** Channel names from SRD §7. */
export const topics = {
  room: (code: string) => `room:${code}`,
  host: (code: string) => `room:${code}:host`,
  player: (code: string, playerId: string) => `room:${code}:p:${playerId}`,
};

const EVENTS = { state: 'state', action: 'action', private: 'private' } as const;

type Status = 'connecting' | 'connected' | 'disconnected';

/**
 * Subscribes once (realtime-js allows one subscribe per channel instance) and
 * keeps reporting status changes afterwards, including automatic rejoins.
 */
function subscribeChannel(channel: RealtimeChannel, onStatus?: (status: Status) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        onStatus?.('connected');
        if (!settled) {
          settled = true;
          resolve();
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onStatus?.('disconnected');
        if (!settled) {
          settled = true;
          reject(err ?? new Error(`Realtime ${status} on ${channel.topic}`));
        }
      }
    });
  });
}

/** A private channel the host only writes to; messages queue until it joins. */
class OutboundChannel {
  private ready = false;
  private queue: unknown[] = [];

  constructor(
    private readonly channel: RealtimeChannel,
    private readonly event: string,
  ) {
    channel.subscribe((status) => {
      this.ready = status === 'SUBSCRIBED';
      if (this.ready) this.flush();
    });
  }

  send(payload: unknown, replaceQueued = false): void {
    if (this.ready) {
      void this.channel.send({ type: 'broadcast', event: this.event, payload });
      return;
    }
    if (replaceQueued) this.queue = this.queue.filter((p) => (p as { type?: string }).type !== 'PRIVATE');
    this.queue.push(payload);
  }

  private flush(): void {
    const pending = this.queue;
    this.queue = [];
    for (const payload of pending) void this.channel.send({ type: 'broadcast', event: this.event, payload });
  }

  get raw(): RealtimeChannel {
    return this.channel;
  }
}

export async function createHostTransport(realtime: RealtimeClient, code: string): Promise<HostTransport> {
  await realtime.setAuth();

  let actionHandler: ((action: Action) => void) | null = null;
  let presenceHandler: ((ids: string[]) => void) | null = null;
  const privates = new Map<string, OutboundChannel>();

  const room = realtime.channel(topics.room(code), {
    config: { private: true, broadcast: { self: false, ack: false }, presence: { key: 'host' } },
  });
  room.on('presence', { event: 'sync' }, () => {
    presenceHandler?.(Object.keys(room.presenceState()));
  });

  const inbox = realtime.channel(topics.host(code), { config: { private: true } });
  inbox.on('broadcast', { event: EVENTS.action }, ({ payload }) => {
    actionHandler?.(payload as Action);
  });

  // Announce host presence on the first join and whenever the channel rejoins after a drop.
  await subscribeChannel(room, (status) => {
    if (status === 'connected') void room.track({ role: 'host' });
  });
  await subscribeChannel(inbox);

  return {
    broadcastState(message: StateBroadcast) {
      void room.send({ type: 'broadcast', event: EVENTS.state, payload: message });
    },
    sendPrivate(playerId: string, message: PrivateMessage | NoticeMessage) {
      let out = privates.get(playerId);
      if (!out) {
        out = new OutboundChannel(
          realtime.channel(topics.player(code, playerId), { config: { private: true } }),
          EVENTS.private,
        );
        privates.set(playerId, out);
      }
      out.send(message, message.type === 'PRIVATE');
    },
    onAction(handler) {
      actionHandler = handler;
    },
    onPresence(handler) {
      presenceHandler = handler;
      handler(Object.keys(room.presenceState()));
    },
    close() {
      for (const out of privates.values()) void realtime.removeChannel(out.raw);
      void realtime.removeChannel(room);
    },
  };
}

export async function createPlayerTransport(
  realtime: RealtimeClient,
  code: string,
  playerId: string,
  onReady: () => void,
): Promise<PlayerTransport> {
  await realtime.setAuth();

  let stateHandler: ((m: StateBroadcast) => void) | null = null;
  let privateHandler: ((m: PrivateMessage | NoticeMessage) => void) | null = null;
  let hostHandler: ((connected: boolean) => void) | null = null;
  let statusHandler: ((s: Status) => void) | null = null;

  const room = realtime.channel(topics.room(code), {
    config: { private: true, broadcast: { self: false, ack: false }, presence: { key: playerId } },
  });
  room.on('broadcast', { event: EVENTS.state }, ({ payload }) => stateHandler?.(payload as StateBroadcast));
  room.on('presence', { event: 'sync' }, () => {
    hostHandler?.('host' in room.presenceState());
  });

  const mine = realtime.channel(topics.player(code, playerId), { config: { private: true } });
  mine.on('broadcast', { event: EVENTS.private }, ({ payload }) =>
    privateHandler?.(payload as PrivateMessage | NoticeMessage),
  );

  // Phones may only write to room:{code}:host, never read it (it carries other players'
  // tokens). Realtime only lets clients join channels they can read, so actions go
  // over the HTTP broadcast endpoint, which checks the write policy.
  const inbox = realtime.channel(topics.host(code), { config: { private: true } });

  await subscribeChannel(mine);
  // On the first join and after any rejoin (phone sleep, network change),
  // re-track presence and ask the host for fresh state.
  await subscribeChannel(room, (status) => {
    statusHandler?.(status);
    if (status === 'connected') {
      void room.track({ role: 'player' });
      onReady();
    }
  });

  return {
    onState(handler) {
      stateHandler = handler;
    },
    onPrivate(handler) {
      privateHandler = handler;
    },
    onHostPresence(handler) {
      hostHandler = handler;
      handler('host' in room.presenceState());
    },
    onStatus(handler) {
      statusHandler = handler;
      handler('connected');
    },
    send(action: Action) {
      void inbox.httpSend(EVENTS.action, action).catch(() => undefined);
    },
    close() {
      void realtime.removeChannel(room);
      void realtime.removeChannel(mine);
    },
  };
}
