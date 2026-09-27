import type { RoomSettings, StepTimer } from '@/lib/types';

const EXTENDED_MULTIPLIER = 1.5;

/**
 * Seconds a step timer actually runs for under the room's timer-length setting,
 * or null when it doesn't run. Only input timers respond to the setting.
 */
export function effectiveSeconds(timer: StepTimer | null, settings: RoomSettings): number | null {
  if (!timer) return null;
  if (timer.kind !== 'input') return timer.seconds;
  switch (settings.timerLength) {
    case 'off':
      return null;
    case 'extended':
      return Math.round(timer.seconds * EXTENDED_MULTIPLIER);
    default:
      return timer.seconds;
  }
}

export function secondsLeft(timerEndsAt: number | null, now: number): number | null {
  if (timerEndsAt == null) return null;
  return Math.max(0, Math.ceil((timerEndsAt - now) / 1000));
}

/**
 * Server-synced clock (FR-7). Host and phones estimate their offset from the
 * server's clock NTP-style, so a timerEndsAt set by the host means the same
 * instant on every phone even when device clocks disagree.
 */
export class ServerClock {
  private offset = 0;
  private synced = false;

  now(): number {
    return Date.now() + this.offset;
  }

  isSynced(): boolean {
    return this.synced;
  }

  /** Converts a server-clock instant to this device's clock. */
  toLocal(serverMs: number): number {
    return serverMs - this.offset;
  }

  async sync(url = '/api/time', samples = 4): Promise<number> {
    const results: { offset: number; rtt: number }[] = [];
    for (let i = 0; i < samples; i++) {
      try {
        const t0 = Date.now();
        const res = await fetch(url, { cache: 'no-store' });
        const t1 = Date.now();
        const body = (await res.json()) as { now: number };
        const rtt = t1 - t0;
        results.push({ offset: body.now + rtt / 2 - t1, rtt });
      } catch {
        // A failed sample just doesn't count.
      }
    }
    if (results.length > 0) {
      results.sort((a, b) => a.rtt - b.rtt);
      this.offset = Math.round(results[0].offset);
      this.synced = true;
    }
    return this.offset;
  }
}

export const clock = new ServerClock();
