import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side helpers for route handlers. Routes act as the calling device
 * (its anonymous-auth JWT) and prove they are our server to the database with
 * GPE_API_SECRET, so the room RPCs can't be called directly from a browser.
 */

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return url;
}

function anonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  return key;
}

export function apiSecret(): string {
  const secret = process.env.GPE_API_SECRET;
  if (!secret) throw new Error('GPE_API_SECRET is not set');
  return secret;
}

/** A client that runs queries as the device that called the route. */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl(), anonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Service-role client for trusted scripts (prompt seeding). Never used by the app. */
export function createAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function jsonError(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
