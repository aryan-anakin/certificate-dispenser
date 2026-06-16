import { requireAdmin } from '@/lib/auth';
import { enqueueBatch } from '@/lib/queue';

// Enqueue email_jobs with staggered scheduled_for; set the batch to `sending`.
export async function POST(_req: Request, ctx: RouteContext<'/api/batches/[id]/start'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  try {
    const result = await enqueueBatch(id);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
