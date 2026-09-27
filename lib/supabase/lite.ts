'use client';

import { AuthClient, type Session } from '@supabase/auth-js';
import { RealtimeClient } from '@supabase/realtime-js';

/**
 * A slim Supabase client for phones: auth-js + realtime-js + fetch, instead
 * of the full supabase-js bundle, to keep /play under the NFR-2 budget.
 * Shares the host's session storage key, so sessions are compatible.
 */
export interface LiteClient {
  url: string;
  key: string;
  auth: InstanceType<typeof AuthClient>;
  realtime: RealtimeClient;
}

let client: LiteClient | null = null;

export function getLite(): LiteClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.');
  const auth = new AuthClient({
    url: `${url}/auth/v1`,
    headers: { apikey: key },
    storageKey: 'gpe-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  });
  const realtime = new RealtimeClient(`${url.replace(/^http/, 'ws')}/realtime/v1`, {
    params: { apikey: key, eventsPerSecond: 100 },
    accessToken: async () => (await auth.getSession()).data.session?.access_token ?? null,
  });
  auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') void realtime.setAuth(session?.access_token ?? null);
  });
  client = { url, key, auth, realtime };
  return client;
}

let pending: Promise<Session> | null = null;

/** Anonymous sign-in (SRD §8), shared with the host page's storage key. */
export function ensureSession(): Promise<Session> {
  if (!pending) {
    pending = (async () => {
      const { auth } = getLite();
      const { data } = await auth.getSession();
      if (data.session) return data.session;
      const { data: signedIn, error } = await auth.signInAnonymously();
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

async function authHeaders(): Promise<Record<string, string>> {
  const session = await ensureSession();
  return { apikey: getLite().key, Authorization: `Bearer ${session.access_token}` };
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

/** PostgREST call as this device (RLS applies). */
export async function rest(path: string, init: RequestInit): Promise<Response> {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json', Prefer: 'return=minimal', ...(init.headers as Record<string, string>) };
  return fetch(`${getLite().url}/rest/v1/${path}`, { ...init, headers });
}

/** Uploads a PNG to the public drawings bucket and returns its public URL. */
export async function uploadDrawing(path: string, png: Blob): Promise<string> {
  const { url } = getLite();
  const res = await fetch(`${url}/storage/v1/object/drawings/${path}`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'image/png', 'x-upsert': 'false', 'cache-control': 'max-age=3600' },
    body: png,
  });
  if (!res.ok) throw new Error('Upload failed. Check your connection and try again.');
  return `${url}/storage/v1/object/public/drawings/${path}`;
}
