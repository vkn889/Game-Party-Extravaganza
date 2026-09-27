'use client';

/** localStorage helpers. Storage can be unavailable (private mode), so every access is guarded. */

export interface Seat {
  code: string;
  roomId: string;
  playerId: string;
  token: string;
  name: string;
  isAudience: boolean;
}

export interface HostRecord {
  code: string;
  roomId: string;
  hostSecret: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: reconnection falls back to re-joining by name.
  }
}

export const seatKey = (code: string) => `gpe:seat:${code.toUpperCase()}`;

export const storage = {
  getSeat: (code: string) => read<Seat>(seatKey(code)),
  setSeat: (seat: Seat) => write(seatKey(seat.code), seat),
  clearSeat: (code: string) => write(seatKey(code), null),
  getHost: () => read<HostRecord>('gpe:host'),
  setHost: (record: HostRecord | null) => write('gpe:host', record),
  getLastName: () => read<string>('gpe:name') ?? '',
  setLastName: (name: string) => write('gpe:name', name),
  getHostPrefs: () => read<Record<string, unknown>>('gpe:host-prefs'),
  setHostPrefs: (prefs: Record<string, unknown>) => write('gpe:host-prefs', prefs),
};
