import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { getAdminClient, CERTS_BUCKET } from '@/lib/supabase';
import type { Template } from '@/types';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const db = getAdminClient();
  const { data, error } = await db
    .from('templates').select('*').order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ templates: data });
}

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

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const form = await request.formData();
  const file = form.get('file');
  const name = String(form.get('name') ?? '').trim();

  if (!(file instanceof File)) {
    return Response.json({ error: 'A template file is required.' }, { status: 400 });
  }
  if (!name) {
    return Response.json({ error: 'A template name is required.' }, { status: 400 });
  }

  // Parse the JSON-ish fields leniently.
  const parsedPlaceholders = safeJson(form.get('placeholders'));
  const parsedQr = safeJson(form.get('qr_position'));

  const ph = placeholderSchema.safeParse(parsedPlaceholders ?? {});
  if (!ph.success) {
    return Response.json(
      { error: 'Invalid placeholders JSON', detail: ph.error.issues },
      { status: 400 }
    );
  }
  const qr = qrSchema.safeParse(parsedQr ?? { x: 40, y: 40, size: 90 });
  if (!qr.success) {
    return Response.json(
      { error: 'Invalid qr_position JSON', detail: qr.error.issues },
      { status: 400 }
    );
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const fileType = isPdf ? 'pdf' : 'image';
  const ext = isPdf ? 'pdf' : file.name.split('.').pop()?.toLowerCase() || 'png';

  const width = Number(form.get('width')) || (isPdf ? 842 : 842);
  const height = Number(form.get('height')) || (isPdf ? 595 : 595);

  const db = getAdminClient();
  const id = randomUUID();
  const storagePath = `templates/${id}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await db.storage
    .from(CERTS_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type || undefined, upsert: true });
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

  const row = {
    id,
    name,
    storage_path: storagePath,
    file_type: fileType,
    placeholders: ph.data,
    qr_position: qr.data,
    width,
    height,
  };
  const { data, error } = await db.from('templates').insert(row).select().single<Template>();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ template: data }, { status: 201 });
}

function safeJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return undefined; // signals "present but invalid"
  }
}
