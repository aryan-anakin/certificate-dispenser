import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase';
import type { Batch, Certificate } from '@/types';

export async function GET(_req: Request, ctx: RouteContext<'/api/batches/[id]'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const db = getAdminClient();

  const { data: batch, error } = await db
    .from('batches').select('*').eq('id', id).single<Batch>();
  if (error || !batch) {
    return Response.json({ error: 'Batch not found' }, { status: 404 });
  }

  const { data: certificates } = await db
    .from('certificates')
    .select('*')
    .eq('batch_id', id)
    .order('created_at', { ascending: true })
    .returns<Certificate[]>();

  return Response.json({ batch, certificates: certificates ?? [] });
}
