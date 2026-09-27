export const dynamic = 'force-dynamic';

/** Server clock for timer sync (FR-7). */
export function GET() {
  return Response.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
