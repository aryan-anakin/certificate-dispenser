import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase';
import { refreshBatchCounts } from '@/lib/queue';
import type { Certificate } from '@/types';

// Un-revoke a certificate. We don't store the pre-revoke status, so reconstruct
// a sensible one from the cert's data: sent → 'sent', generated PDF → 'generated',
// otherwise back to 'pending'. Its verification page becomes valid again.
export async function POST(_req: Request, ctx: RouteContext<'/api/certificates/[id]/restore'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const db = getAdminClient();

  const { data: cert } = await db
    .from('certificates').select('*').eq('id', id).single<Certificate>();
  if (!cert) return Response.json({ error: 'Certificate not found' }, { status: 404 });
  if (cert.status !== 'revoked') return Response.json({ ok: true, status: cert.status });

  const newStatus = cert.sent_at ? 'sent' : cert.pdf_path ? 'generated' : 'pending';
  const { error } = await db
    .from('certificates').update({ status: newStatus, last_error: null }).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await refreshBatchCounts(cert.batch_id);
  return Response.json({ ok: true, status: newStatus });
}
