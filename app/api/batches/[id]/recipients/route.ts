import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase';
import { refreshBatchCounts } from '@/lib/queue';
import type { Certificate } from '@/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().refine((v) => EMAIL_RE.test(v), 'Invalid email address'),
  custom_fields: z.record(z.string(), z.string()).optional(),
});

// Manually add one recipient to an existing batch (status `pending`, so it gets
// picked up by the next Generate → Start). A fresh random UUID is assigned by the DB.
export async function POST(request: Request, ctx: RouteContext<'/api/batches/[id]/recipients'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  const db = getAdminClient();

  const { data: batch } = await db
    .from('batches').select('id').eq('id', id).single<{ id: string }>();
  if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });

  const { data, error } = await db
    .from('certificates')
    .insert({
      batch_id: id,
      recipient_name: parsed.data.name,
      recipient_email: parsed.data.email,
      custom_fields: parsed.data.custom_fields ?? {},
      status: 'pending',
    })
    .select('*')
    .single<Certificate>();

  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Failed to add recipient' }, { status: 500 });
  }

  await refreshBatchCounts(id); // keep total_count accurate
  return Response.json({ certificate: data }, { status: 201 });
}
