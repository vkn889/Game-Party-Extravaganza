'use client';

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.');
    }
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gpe-auth' },
      realtime: { params: { eventsPerSecond: 100 } },
    });
  }
  return client;
}

let pending: Promise<Session> | null = null;

/**
 * Every device signs in with Supabase anonymous auth (SRD §8): no accounts,
 * but a user id that RLS and Realtime Authorization can check.
 */
export function ensureSession(): Promise<Session> {
  if (!pending) {
    pending = (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session;
      const { data: signedIn, error } = await supabase.auth.signInAnonymously();
      if (error || !signedIn.session) {
        throw new Error(
          error?.message.includes('Anonymous sign-ins are disabled')
            ? 'Anonymous sign-ins are disabled for this Supabase project.'
            : 'Could not connect. Check your connection and try again.',
        );
      }
      return signedIn.session;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}

/** POSTs JSON to one of our API routes with the device's auth token. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const session = await ensureSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    const error = new Error(json.message ?? 'Something went wrong.') as Error & { code?: string; status?: number };
    error.code = json.error;
    error.status = res.status;
    throw error;
  }
  return json;
}
