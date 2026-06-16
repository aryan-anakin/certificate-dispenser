import { requireAdmin } from '@/lib/auth';
import { generateBatch } from '@/lib/queue';

// Generate PDFs + QR for all pending certificates in the batch.
export async function POST(_req: Request, ctx: RouteContext<'/api/batches/[id]/generate'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  try {
    const result = await generateBatch(id);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
