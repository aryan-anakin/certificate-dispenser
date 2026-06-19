import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { getAdminClient, CERTS_BUCKET } from '@/lib/supabase';
import { refreshBatchCounts } from '@/lib/queue';
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

const patchSchema = z
  .object({
    template_id: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).optional(),
    email_subject: z.string().trim().min(1).optional(),
    email_body: z.string().trim().min(1).optional(),
    send_interval_seconds: z.coerce.number().int().min(0).max(86400).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Nothing to update' });

// Edit a batch — e.g. change its template. Changing the template resets any
// already-generated (or failed) certs back to `pending` so a re-generate applies it.
export async function PATCH(request: Request, ctx: RouteContext<'/api/batches/[id]'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  const db = getAdminClient();
  const { data: current } = await db
    .from('batches').select('template_id').eq('id', id).single<Pick<Batch, 'template_id'>>();
  if (!current) return Response.json({ error: 'Batch not found' }, { status: 404 });

  const templateChanged =
    parsed.data.template_id !== undefined && parsed.data.template_id !== current.template_id;

  const { data: batch, error } = await db
    .from('batches').update(parsed.data).eq('id', id).select('*').single<Batch>();
  if (error || !batch) {
    return Response.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
  }

  // Invalidate stale PDFs so the new template takes effect on the next generate.
  // Never touch certs already sent/sending/queued/revoked.
  let resetCount = 0;
  if (templateChanged) {
    const { data: reset } = await db
      .from('certificates')
      .update({ status: 'pending', pdf_path: null, issued_at: null })
      .eq('batch_id', id)
      .in('status', ['generated', 'failed'])
      .select('id');
    resetCount = reset?.length ?? 0;
    await refreshBatchCounts(id);
  }

  return Response.json({ batch, templateChanged, resetCount });
}

// Delete a batch and everything under it. Certificates + email_jobs cascade via
// the schema FKs; we also best-effort delete the generated PDFs from Storage.
export async function DELETE(_req: Request, ctx: RouteContext<'/api/batches/[id]'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const db = getAdminClient();

  const { data: batch } = await db
    .from('batches').select('id').eq('id', id).single<{ id: string }>();
  if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });

  // Remove generated PDFs (stored under "<batchId>/<uuid>.pdf"). Best-effort.
  const { data: files } = await db.storage.from(CERTS_BUCKET).list(id);
  if (files && files.length > 0) {
    await db.storage.from(CERTS_BUCKET).remove(files.map((f) => `${id}/${f.name}`));
  }

  const { error } = await db.from('batches').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
