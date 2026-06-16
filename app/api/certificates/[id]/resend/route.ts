import { requireAdmin } from '@/lib/auth';
import { requeueCertificate } from '@/lib/queue';

// Re-queue a single certificate (e.g. an individual failed send).
export async function POST(_req: Request, ctx: RouteContext<'/api/certificates/[id]/resend'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  try {
    await requeueCertificate(id);
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 400 });
  }
}
