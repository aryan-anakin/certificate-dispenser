import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase';

// Mark a certificate revoked → its verification page flips to "revoked".
export async function POST(_req: Request, ctx: RouteContext<'/api/certificates/[id]/revoke'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const db = getAdminClient();

  const { data, error } = await db
    .from('certificates')
    .update({ status: 'revoked' })
    .eq('id', id)
    .select('id,batch_id')
    .single<{ id: string; batch_id: string }>();
  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Certificate not found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
