import type { NextRequest } from 'next/server';
import { tick, type TickResult } from '@/lib/queue';

// Protected by CRON_SECRET. Drains up to `max` due jobs (default 1) per call.
// Idempotent: safe to call on any schedule; already-sent certs are never re-sent.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
// If CRON_SECRET is unset, the endpoint runs OPEN (local dev only).
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    const qs = request.nextUrl.searchParams.get('secret');
    if (bearer !== secret && qs !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const maxParam = Number(request.nextUrl.searchParams.get('max'));
  const max = Number.isFinite(maxParam) && maxParam > 0 ? Math.min(maxParam, 50) : 1;

  const results: TickResult[] = [];
  for (let i = 0; i < max; i++) {
    const r = await tick();
    if (!r.processed) break; // nothing due right now
    results.push(r);
  }

  return Response.json({ ok: true, processed: results.length, results });
}

// Convenience: allow GET for easy cron pings (same auth).
export async function GET(request: NextRequest) {
  return POST(request);
}
