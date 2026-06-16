import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase';

// Pause: the worker's claim function skips jobs whose batch is `paused`.
// Resume by POSTing again (toggles back to `sending`).
export async function POST(_req: Request, ctx: RouteContext<'/api/batches/[id]/pause'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const db = getAdminClient();

  const { data: batch } = await db
    .from('batches').select('status').eq('id', id).single<{ status: string }>();
  if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });

  const next = batch.status === 'paused' ? 'sending' : 'paused';
  const { error } = await db.from('batches').update({ status: next }).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, status: next });
}
