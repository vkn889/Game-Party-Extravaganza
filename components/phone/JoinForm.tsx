'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/shared/Button';
import { NAME_MAX } from '@/lib/engine/filter';
import { storage } from '@/lib/realtime/storage';
import { CODE_ALPHABET, isRoomCode, normalizeCode } from '@/lib/room-code';

interface JoinResponse {
  room: { id: string; code: string };
  player: { id: string; name: string; token: string; isAudience: boolean };
}

/** Code + name entry (FR-2). Designed to get a player into the lobby in seconds. */
export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const codeId = useId();
  const nameId = useId();
  const [code, setCode] = useState(() => normalizeCode(params.get('code')).replace(new RegExp(`[^${CODE_ALPHABET}]`, 'g'), '').slice(0, 4));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get('error'));

  useEffect(() => {
    // Warm up the networking code and the anonymous session while the player types.
    void import('@/lib/supabase/lite').then((lite) => lite.ensureSession()).catch(() => undefined);
    setName(storage.getLastName());
    // Already have a seat in this room? Go straight back in (FR-8).
    const c = normalizeCode(params.get('code'));
    if (isRoomCode(c) && storage.getSeat(c) && !params.get('error')) router.replace(`/play/${c}`);
  }, [params, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isRoomCode(code) || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { apiPost } = await import('@/lib/supabase/lite');
      const res = await apiPost<JoinResponse>('/api/rooms/join', { code, name: name.trim() });
      storage.setLastName(name.trim());
      storage.setSeat({
        code: res.room.code,
        roomId: res.room.id,
        playerId: res.player.id,
        token: res.player.token,
        name: res.player.name,
        isAudience: res.player.isAudience,
      });
      router.push(`/play/${res.room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={codeId} className="font-display text-xl font-semibold">
          Room code
        </label>
        <input
          id={codeId}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(new RegExp(`[^${CODE_ALPHABET}]`, 'g'), '').slice(0, 4))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABCD"
          maxLength={4}
          aria-describedby={`${codeId}-hint`}
          className="font-display h-20 rounded-2xl bg-peach text-center text-5xl font-bold tracking-[0.3em] text-plum placeholder:text-plum/30"
        />
        <p id={`${codeId}-hint`} className="text-sm text-peach/80">
          4 letters from the big screen.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="font-display text-xl font-semibold">
          Your name
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          placeholder="Up to 12 characters"
          className="h-14 rounded-2xl bg-peach px-4 text-xl text-plum placeholder:text-plum/50"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-plum-deep px-4 py-3 font-semibold text-pink">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block disabled={busy || !isRoomCode(code) || !name.trim()}>
        {busy ? 'Joining…' : 'Join game'}
      </Button>
    </form>
  );
}
