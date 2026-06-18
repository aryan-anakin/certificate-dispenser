import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { getAdminClient, CERTS_BUCKET } from '@/lib/supabase';
import type { Template } from '@/types';

const placeholderSchema = z.record(
  z.string(),
  z.object({
    x: z.number(),
    y: z.number(),
    fontSize: z.number().default(24),
    color: z.string().optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    font: z.string().optional(),
  })
);
const qrSchema = z.object({ x: z.number(), y: z.number(), size: z.number() });

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    placeholders: placeholderSchema.optional(),
    qr_position: qrSchema.optional(),
    width: z.coerce.number().int().positive().optional(),
    height: z.coerce.number().int().positive().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Nothing to update' });

// Edit a template's name and placement (placeholders / QR / dimensions).
// The stored file itself is not changed here.
export async function PATCH(request: Request, ctx: RouteContext<'/api/templates/[id]'>) {
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
  const { data, error } = await db
    .from('templates').update(parsed.data).eq('id', id).select('*').single<Template>();
  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Template not found' }, { status: 404 });
  }

  return Response.json({ template: data });
}

// Delete a template (and its stored file). Batches referencing it fall back to
// the default certificate (the FK is `on delete set null`).
export async function DELETE(_req: Request, ctx: RouteContext<'/api/templates/[id]'>) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const db = getAdminClient();

  const { data: template } = await db
    .from('templates').select('storage_path').eq('id', id).single<Pick<Template, 'storage_path'>>();
  if (!template) {
    return Response.json({ error: 'Template not found' }, { status: 404 });
  }

  // Remove the stored file first (best-effort — don't block the row delete on it).
  if (template.storage_path) {
    await db.storage.from(CERTS_BUCKET).remove([template.storage_path]);
  }

  const { error } = await db.from('templates').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
