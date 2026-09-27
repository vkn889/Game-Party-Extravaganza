/**
 * Drawings are uploaded by phones to Supabase Storage and only their URLs go
 * over Realtime (SRD §5). The host accepts a URL only if it points at the
 * sender's own folder in the drawings bucket of this project.
 */
const PATH = /^\/storage\/v1\/object\/public\/drawings\/[0-9a-f-]{36}\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.png$/;

export const MAX_DRAWING_BYTES = 200 * 1024;

export function isDrawingUrl(value: unknown, playerId: string): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (base && url.origin !== new URL(base).origin) return false;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const match = PATH.exec(url.pathname);
  return Boolean(match && match[1] === playerId);
}
