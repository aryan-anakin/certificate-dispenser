import { requireAdmin } from '@/lib/auth';
import { getAdminClient, CERTS_BUCKET } from '@/lib/supabase';
import type { Template } from '@/types';

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
