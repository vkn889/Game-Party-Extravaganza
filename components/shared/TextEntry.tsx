'use client';

import { useId, useState, type FormEvent } from 'react';
import { DEFAULT_MAX_CHARS } from '@/lib/engine/text';
import { Button } from './Button';

interface TextEntryProps {
  label: string;
  onSubmit: (text: string) => void;
  maxLength?: number;
  placeholder?: string;
  submitLabel?: string;
  multiline?: boolean;
  error?: string | null;
  autoFocus?: boolean;
  /** Clear the field after each submit (for games that take several entries). */
  resetOnSubmit?: boolean;
  inputMode?: 'text' | 'numeric';
}

/** A text input with a visible character limit (default 60, PRD §3). */
export function TextEntry({
  label,
  onSubmit,
  maxLength = DEFAULT_MAX_CHARS,
  placeholder,
  submitLabel = 'Send',
  multiline = false,
  error,
  autoFocus = true,
  resetOnSubmit = false,
  inputMode = 'text',
}: TextEntryProps) {
  const id = useId();
  const [value, setValue] = useState('');
  const trimmed = value.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed);
    if (resetOnSubmit) setValue('');
  }

  const fieldClass =
    'w-full rounded-2xl bg-peach px-4 py-3 text-lg text-plum placeholder:text-plum/55 focus:outline-none focus-visible:outline-3 focus-visible:outline-pink';
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor={id} className="font-display text-xl font-semibold">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          maxLength={maxLength}
          rows={3}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          className={`${fieldClass} resize-none`}
        />
      ) : (
        <input
          id={id}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="sentences"
          inputMode={inputMode}
          enterKeyHint="send"
          onChange={(e) => setValue(e.target.value)}
          className={fieldClass}
        />
      )}
      <div className="flex items-center justify-between text-sm">
        <span role="alert" className="font-semibold text-pink">
          {error ?? ''}
        </span>
        <span className="tabular-nums text-peach/75">
          {Array.from(value).length}/{maxLength}
        </span>
      </div>
      <Button type="submit" size="lg" block disabled={!trimmed}>
        {submitLabel}
      </Button>
    </form>
  );
}
