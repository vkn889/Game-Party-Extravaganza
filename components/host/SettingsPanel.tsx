'use client';

import { Check, Music, Palette, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { contrast, DEFAULT_THEME, sameTheme, THEME_KEYS, THEME_LABELS, THEME_PRESETS, type Theme } from '@/lib/theme';
import { MUSIC_TRACKS, type RoomSettings, type TimerLength } from '@/lib/types';

interface SettingsPanelProps {
  settings: RoomSettings;
  onChange: (patch: Partial<RoomSettings>) => void;
  onClose: () => void;
  onSkip?: () => void;
  onNewRoom: () => void;
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="flex flex-col">
        <span className="font-display text-xl font-semibold">{label}</span>
        <span className="text-sm text-peach/80">{detail}</span>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-9 w-16 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-mint' : 'bg-plum-deep'}`}
      >
        <span className={`absolute top-1 h-7 w-7 rounded-full bg-peach transition-transform duration-200 ${checked ? 'translate-x-8' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function Volume({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-display flex justify-between text-xl font-semibold">
        {label} <span className="tabular-nums text-peach/80">{Math.round(value * 100)}%</span>
      </label>
      <input id={id} type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="h-8 accent-pink" />
    </div>
  );
}

function MusicPicker({ track, onChange }: { track: number; onChange: (id: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-display mb-2 flex items-center gap-2 text-xl font-semibold">
        <Music aria-hidden className="h-5 w-5 text-pink" /> Music
      </legend>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Background music">
        {MUSIC_TRACKS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={track === t.id}
            onClick={() => onChange(t.id)}
            className={`flex min-h-12 items-center justify-between rounded-xl px-4 font-semibold ${track === t.id ? 'bg-purple text-peach' : 'bg-plum text-peach/85 hover:bg-plum-deep'}`}
          >
            <span>
              {t.id}. {t.name}
            </span>
            {track === t.id && <Check aria-hidden className="h-5 w-5" />}
          </button>
        ))}
      </div>
      <p className="text-sm text-peach/75">Plays on the big screen through the lobby, every game and the results.</p>
    </fieldset>
  );
}

function ThemeEditor({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  // Color pickers fire continuously while dragging; send the change once it settles.
  const [draft, setDraft] = useState(theme);
  const timer = useRef<number | null>(null);
  useEffect(() => setDraft(theme), [theme]);
  function edit(next: Theme, immediate = false) {
    setDraft(next);
    if (timer.current) window.clearTimeout(timer.current);
    if (immediate) onChange(next);
    else timer.current = window.setTimeout(() => onChange(next), 250);
  }
  const lowContrast = contrast(draft.peach, draft.plum) < 4.5 || contrast(draft.plum, draft.mint) < 4.5;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-display mb-2 flex items-center gap-2 text-xl font-semibold">
        <Palette aria-hidden className="h-5 w-5 text-pink" /> Color scheme
      </legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Color presets">
        {THEME_PRESETS.map((p) => {
          const active = sameTheme(p.theme, draft);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => edit(p.theme, true)}
              className={`flex min-h-12 flex-col gap-2 rounded-xl p-3 text-left ${active ? 'ring-3 ring-pink' : 'ring-1 ring-peach/25'}`}
              style={{ backgroundColor: p.theme.plum, color: p.theme.peach }}
            >
              <span className="font-semibold">{p.name}</span>
              <span className="flex gap-1" aria-hidden>
                {THEME_KEYS.map((k) => (
                  <span key={k} className="h-4 w-4 rounded-full ring-1 ring-black/20" style={{ backgroundColor: p.theme[k] }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-peach/85">Custom colors</p>
        {THEME_KEYS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-3">
            <span>{THEME_LABELS[k]}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-sm text-peach/75">{draft[k]}</span>
              <input
                type="color"
                value={draft[k].toLowerCase()}
                onChange={(e) => edit({ ...draft, [k]: e.target.value.toUpperCase() })}
                aria-label={`${THEME_LABELS[k]} color`}
                className="h-10 w-14 cursor-pointer rounded-lg border-0 bg-transparent"
              />
            </span>
          </label>
        ))}
      </div>
      {lowContrast && (
        <p role="status" className="rounded-xl bg-plum-deep px-3 py-2 text-sm text-pink">
          Heads up: text may be hard to read with these colors from across the room.
        </p>
      )}
      {!sameTheme(draft, DEFAULT_THEME) && (
        <button type="button" onClick={() => edit(DEFAULT_THEME, true)} className="min-h-11 rounded-xl text-sm font-semibold ring-1 ring-peach/40 hover:bg-plum">
          Reset to Classic
        </button>
      )}
    </fieldset>
  );
}

const TIMER_OPTIONS: { value: TimerLength; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'extended', label: 'Extended' },
  { value: 'off', label: 'Off' },
];

/** Host settings (PRD §2, FR-12, FR-16). */
export function SettingsPanel({ settings, onChange, onClose, onSkip, onNewRoom }: SettingsPanelProps) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Room settings" className="fixed inset-0 z-40 flex justify-end bg-plum-deep/70" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col gap-6 overflow-y-auto bg-plum-raised p-8 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl font-bold">Settings</h2>
          <button type="button" aria-label="Close settings" onClick={onClose} className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-plum">
            <X aria-hidden className="h-7 w-7" />
          </button>
        </div>
        <Toggle
          label="Family friendly"
          detail="Filters prompts and player text."
          checked={settings.familyFriendly}
          onChange={(familyFriendly) => onChange({ familyFriendly })}
        />
        <Toggle
          label="Audience"
          detail="Up to 50 extra people can vote and react."
          checked={settings.audience}
          onChange={(audience) => onChange({ audience })}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="font-display mb-2 text-xl font-semibold">Timers</legend>
          <div className="grid grid-cols-3 gap-2">
            {TIMER_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={settings.timerLength === o.value}
                onClick={() => onChange({ timerLength: o.value })}
                className={`min-h-12 rounded-xl font-semibold ${settings.timerLength === o.value ? 'bg-purple text-peach' : 'bg-plum text-peach/85'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-peach/75">Timer changes apply from the next phase.</p>
        </fieldset>
        <MusicPicker track={settings.musicTrack} onChange={(musicTrack) => onChange({ musicTrack })} />
        <Volume label="Music volume" value={settings.musicVolume} onChange={(musicVolume) => onChange({ musicVolume })} />
        <Volume label="Sound effects" value={settings.sfxVolume} onChange={(sfxVolume) => onChange({ sfxVolume })} />
        <ThemeEditor theme={settings.theme} onChange={(theme) => onChange({ theme })} />
        <div className="mt-auto flex flex-col gap-3">
          {onSkip && (
            <button type="button" onClick={onSkip} className="min-h-12 rounded-xl bg-plum font-semibold hover:bg-plum-deep">
              Skip this phase
            </button>
          )}
          <button type="button" onClick={onNewRoom} className="min-h-12 rounded-xl text-pink ring-2 ring-pink/50 hover:bg-plum">
            Close room and start a new one
          </button>
        </div>
      </div>
    </div>
  );
}
