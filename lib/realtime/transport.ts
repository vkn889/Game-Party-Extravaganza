import type {
  Action,
  ContentPacks,
  NoticeMessage,
  PrivateMessage,
  RoomPlayer,
  RoomSettings,
  StateBroadcast,
} from '@/lib/types';

/**
 * Transport seam between the host engine and the network. The Supabase
 * Realtime implementation lives in supabaseTransport.ts; a lower-latency
 * transport (PartyKit, SRD §5 fallback) can be swapped in behind this.
 */
export interface HostTransport {
  broadcastState(message: StateBroadcast): void;
  sendPrivate(playerId: string, message: PrivateMessage | NoticeMessage): void;
  onAction(handler: (action: Action) => void): void;
  /** Called with the full set of connected presence keys (player ids) on every change. */
  onPresence(handler: (connectedIds: string[]) => void): void;
  close(): void;
}

export interface PlayerTransport {
  onState(handler: (message: StateBroadcast) => void): void;
  onPrivate(handler: (message: PrivateMessage | NoticeMessage) => void): void;
  onHostPresence(handler: (connected: boolean) => void): void;
  onStatus(handler: (status: 'connecting' | 'connected' | 'disconnected') => void): void;
  send(action: Action): void;
  close(): void;
}

export interface StoredPlayer extends RoomPlayer {
  token: string;
}

export interface SnapshotWrite {
  snapshot: unknown;
  status: 'lobby' | 'playing';
  currentGame: string | null;
}

/** Database operations the host engine needs (Supabase implementation in hostBackend.ts). */
export interface HostBackend {
  loadPlayers(): Promise<StoredPlayer[]>;
  deletePlayer(id: string): Promise<void>;
  updatePlayer(id: string, patch: { is_vip?: boolean; score?: number; games_won?: number }): Promise<void>;
  saveSnapshot(write: SnapshotWrite): Promise<void>;
  saveSettings(settings: RoomSettings): Promise<void>;
  loadContent(packs: string[], familyFriendly: boolean): Promise<ContentPacks>;
}
