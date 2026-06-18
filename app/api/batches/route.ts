import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabase';
import { parseRecipients } from '@/lib/excel';
import type { Batch } from '@/types';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const db = getAdminClient();
  const { data, error } = await db
    .from('batches').select('*').order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ batches: data });
}

const fieldsSchema = z.object({
  name: z.string().min(1, 'Event name is required'),
  template_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
  email_subject: z.string().min(1).default('Your certificate'),
  email_body: z
    .string()
    .min(1)
    .default('Hi {{name}}, your certificate is attached. Verify it at {{verification_url}}.'),
  send_interval_seconds: z.coerce.number().int().min(0).max(86400).default(30),
});

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'An Excel/CSV file is required.' }, { status: 400 });
  }

  const fields = fieldsSchema.safeParse({
    name: form.get('name') ?? '',
    template_id: form.get('template_id') ?? '',
    email_subject: form.get('email_subject') ?? undefined,
    email_body: form.get('email_body') ?? undefined,
    send_interval_seconds: form.get('send_interval_seconds') ?? undefined,
  });
  if (!fields.success) {
    return Response.json(
      { error: 'Invalid form fields', detail: fields.error.issues },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { recipients, errors } = parseRecipients(buffer);
  if (recipients.length === 0) {
    return Response.json(
      { error: 'No valid recipients found in the file.', parseErrors: errors },
      { status: 400 }
    );
  }

  const db = getAdminClient();

  const { data: batch, error: bErr } = await db
    .from('batches')
    .insert({
      name: fields.data.name,
      template_id: fields.data.template_id,
      email_subject: fields.data.email_subject,
      email_body: fields.data.email_body,
      send_interval_seconds: fields.data.send_interval_seconds,
      status: 'draft',
      total_count: recipients.length,
    })
    .select()
    .single<Batch>();
  if (bErr || !batch) {
    return Response.json({ error: bErr?.message ?? 'Failed to create batch' }, { status: 500 });
  }

  const rows = recipients.map((r) => ({
    batch_id: batch.id,
    recipient_name: r.name,
    recipient_email: r.email,
    custom_fields: r.custom_fields,
    status: 'pending' as const,
  }));

  const { error: cErr } = await db.from('certificates').insert(rows);
  if (cErr) {
    // Roll back the batch so we don't leave an empty shell behind.
    await db.from('batches').delete().eq('id', batch.id);
    return Response.json({ error: cErr.message }, { status: 500 });
  }

  return Response.json(
    { batch, created: recipients.length, parseErrors: errors },
    { status: 201 }
  );
}
