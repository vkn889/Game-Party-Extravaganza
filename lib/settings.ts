import { sanitizeTheme } from './theme';
import { DEFAULT_SETTINGS, MUSIC_TRACKS, type RoomSettings } from './types';

/** A complete, valid RoomSettings from untrusted or partial input. */
export function normalizeSettings(value: unknown): RoomSettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof RoomSettings, unknown>>;
  const volume = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
  const track = Number(input.musicTrack);
  return {
    familyFriendly: typeof input.familyFriendly === 'boolean' ? input.familyFriendly : DEFAULT_SETTINGS.familyFriendly,
    timerLength: input.timerLength === 'normal' || input.timerLength === 'extended' || input.timerLength === 'off' ? input.timerLength : DEFAULT_SETTINGS.timerLength,
    audience: typeof input.audience === 'boolean' ? input.audience : DEFAULT_SETTINGS.audience,
    musicVolume: volume(input.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: volume(input.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    musicTrack: MUSIC_TRACKS.some((t) => t.id === track) ? track : DEFAULT_SETTINGS.musicTrack,
    theme: sanitizeTheme(input.theme),
  };
}
