import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase';
import type { Certificate } from '@/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const patchSchema = z
  .object({
    recipient_name: z.string().trim().min(1, 'Name cannot be empty').optional(),
    recipient_email: z
      .string()
      .trim()
      .refine((v) => EMAIL_RE.test(v), 'Invalid email address')
      .optional(),
  })
  .refine((o) => o.recipient_name !== undefined || o.recipient_email !== undefined, {
    message: 'Nothing to update',
  });

// Edit a recipient's name / email.
export async function PATCH(request: Request, ctx: RouteContext<'/api/certificates/[id]'>) {
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
    .from('certificates')
    .update(parsed.data)
    .eq('id', id)
    .select('*')
    .single<Certificate>();

  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Certificate not found' }, { status: 404 });
  }

  // The recipient_name is baked into an already-generated PDF, so flag when a
  // re-generate is needed for the document to match the edited name.
  const nameChangedAfterGenerate =
    parsed.data.recipient_name !== undefined && data.pdf_path != null;

  return Response.json({ certificate: data, regenerateRecommended: nameChangedAfterGenerate });
}
