// Generation + email queue orchestration.
//
// Resumability contract: sending is keyed off email_jobs.scheduled_for and
// claimed atomically via the claim_next_email_job() SQL function (FOR UPDATE
// SKIP LOCKED). A restart mid-batch always resumes from the next due, unsent
// job, and a certificate already marked `sent` is never re-sent.

import { getAdminClient, CERTS_BUCKET } from '@/lib/supabase';
import { generateCertificatePdf } from '@/lib/pdf';
import { qrPngForUuid, verificationUrl } from '@/lib/qr';
import { sendCertificateEmail } from '@/lib/resend';
import type { Batch, Certificate, EmailJob, Template } from '@/types';

const MAX_ATTEMPTS = 3;

/** {{token}} substitution (whitespace-tolerant). Unknown tokens render empty. */
export function mergeTokens(input: string, values: Record<string, string>): string {
  return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, raw: string) => {
    const key = raw.trim();
    if (values[key] != null) return values[key];
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(values)) {
      if (k.toLowerCase() === lower) return v;
    }
    return '';
  });
}

function certValues(cert: Certificate, batch: Batch): Record<string, string> {
  return {
    name: cert.recipient_name,
    email: cert.recipient_email,
    ...cert.custom_fields,
    verification_url: verificationUrl(cert.uuid),
    certificate_id: cert.uuid,
    batch: batch.name,
    event: batch.name,
    title: batch.name,
  };
}

// ── Generation ────────────────────────────────────────────────────────────────

export interface GenerateResult {
  generated: number;
  failed: number;
  errors: string[];
}

export async function generateBatch(batchId: string): Promise<GenerateResult> {
  const db = getAdminClient();

  const { data: batch, error: bErr } = await db
    .from('batches').select('*').eq('id', batchId).single<Batch>();
  if (bErr || !batch) throw new Error(bErr?.message ?? 'Batch not found');

  await db.from('batches').update({ status: 'generating' }).eq('id', batchId);

  // Load the template + its file bytes once, reused for every certificate.
  let template: Template | null = null;
  let templateBytes: Uint8Array | null = null;
  if (batch.template_id) {
    const { data: t } = await db
      .from('templates').select('*').eq('id', batch.template_id).single<Template>();
    if (t) {
      template = t;
      const { data: file, error: dErr } = await db.storage
        .from(CERTS_BUCKET).download(t.storage_path);
      if (dErr || !file) throw new Error(`Could not load template file: ${dErr?.message}`);
      templateBytes = new Uint8Array(await file.arrayBuffer());
    }
  }

  const { data: certs } = await db
    .from('certificates').select('*').eq('batch_id', batchId).eq('status', 'pending')
    .returns<Certificate[]>();

  const result: GenerateResult = { generated: 0, failed: 0, errors: [] };

  for (const cert of certs ?? []) {
    try {
      const qrPng = await qrPngForUuid(cert.uuid);
      const pdf = await generateCertificatePdf({
        template,
        templateBytes,
        qrPng,
        data: {
          recipientName: cert.recipient_name,
          batchName: batch.name,
          customFields: cert.custom_fields ?? {},
        },
      });

      const path = `${batchId}/${cert.uuid}.pdf`;
      const { error: upErr } = await db.storage
        .from(CERTS_BUCKET)
        .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw new Error(upErr.message);

      await db.from('certificates').update({
        pdf_path: path,
        status: 'generated',
        issued_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', cert.id);

      result.generated += 1;
    } catch (err) {
      result.failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${cert.recipient_email}: ${msg}`);
      await db.from('certificates')
        .update({ status: 'failed', last_error: msg }).eq('id', cert.id);
    }
  }

  await db.from('batches').update({ status: 'ready' }).eq('id', batchId);
  await refreshBatchCounts(batchId);
  return result;
}

// ── Enqueue ──────────────────────────────────────────────────────────────────

export async function enqueueBatch(batchId: string): Promise<{ queued: number }> {
  const db = getAdminClient();

  const { data: batch, error: bErr } = await db
    .from('batches').select('*').eq('id', batchId).single<Batch>();
  if (bErr || !batch) throw new Error(bErr?.message ?? 'Batch not found');

  // Only certs that are generated (or previously failed) and not already queued/sent.
  const { data: certs } = await db
    .from('certificates').select('*')
    .eq('batch_id', batchId).in('status', ['generated', 'failed'])
    .order('created_at', { ascending: true })
    .returns<Certificate[]>();

  // Nothing to send yet — almost always "Start" was clicked before "Generate".
  // Bail without touching batch status so it isn't falsely marked sending/completed.
  if (!certs || certs.length === 0) {
    throw new Error(
      'No generated certificates to send. Click “Generate PDFs” first, then “Start sending”.'
    );
  }

  const interval = Math.max(0, batch.send_interval_seconds || 0);
  const now = Date.now();

  let queued = 0;
  for (let i = 0; i < (certs?.length ?? 0); i++) {
    const cert = certs![i];
    const scheduledFor = new Date(now + i * interval * 1000).toISOString();

    const { error: jErr } = await db.from('email_jobs').insert({
      certificate_id: cert.id,
      batch_id: batchId,
      scheduled_for: scheduledFor,
      status: 'pending',
    });
    if (jErr) continue;

    await db.from('certificates')
      .update({ status: 'queued', last_error: null }).eq('id', cert.id);
    queued += 1;
  }

  await db.from('batches').update({ status: 'sending' }).eq('id', batchId);
  await refreshBatchCounts(batchId);
  return { queued };
}

/** Re-queue a single certificate (failed retry, or one-off resend). */
export async function requeueCertificate(certificateId: string): Promise<void> {
  const db = getAdminClient();
  const { data: cert } = await db
    .from('certificates').select('*').eq('id', certificateId).single<Certificate>();
  if (!cert) throw new Error('Certificate not found');
  if (cert.status === 'revoked') throw new Error('Certificate is revoked');

  await db.from('email_jobs').insert({
    certificate_id: cert.id,
    batch_id: cert.batch_id,
    scheduled_for: new Date().toISOString(),
    status: 'pending',
  });
  await db.from('certificates')
    .update({ status: 'queued', last_error: null }).eq('id', cert.id);
  await db.from('batches').update({ status: 'sending' }).eq('id', cert.batch_id);
}

// ── Worker tick ────────────────────────────────────────────────────────────────

export interface TickResult {
  processed: boolean;
  certificateId?: string;
  outcome?: 'sent' | 'retry' | 'failed' | 'skipped';
  error?: string;
}

export async function tick(): Promise<TickResult> {
  const db = getAdminClient();

  // Atomically claim the next due job (marks it `processing`, bumps attempts).
  // Returns 0 or 1 row; maybeSingle() gives null (no error) when nothing is due.
  const { data: job, error: claimErr } = await db
    .rpc('claim_next_email_job').maybeSingle<EmailJob>();
  if (claimErr) throw new Error(claimErr.message);
  if (!job) return { processed: false };

  const { data: cert } = await db
    .from('certificates').select('*').eq('id', job.certificate_id).single<Certificate>();
  if (!cert) {
    await db.from('email_jobs').update({ status: 'failed' }).eq('id', job.id);
    return { processed: true, outcome: 'skipped', error: 'certificate missing' };
  }

  // Idempotency: never re-send an already-sent or revoked certificate.
  if (cert.status === 'sent' || cert.status === 'revoked') {
    await db.from('email_jobs').update({ status: 'done' }).eq('id', job.id);
    return { processed: true, certificateId: cert.id, outcome: 'skipped' };
  }

  const { data: batch } = await db
    .from('batches').select('*').eq('id', cert.batch_id).single<Batch>();
  if (!batch) {
    await db.from('email_jobs').update({ status: 'failed' }).eq('id', job.id);
    return { processed: true, certificateId: cert.id, outcome: 'skipped', error: 'batch missing' };
  }

  await db.from('certificates').update({ status: 'sending' }).eq('id', cert.id);

  // Permanent failure if the PDF was never generated.
  if (!cert.pdf_path) {
    return finalizeFailure(db, job, cert, batch.id, 'Certificate PDF not generated');
  }

  const { data: file, error: dErr } = await db.storage
    .from(CERTS_BUCKET).download(cert.pdf_path);
  if (dErr || !file) {
    return finalizeFailure(db, job, cert, batch.id, `PDF download failed: ${dErr?.message}`);
  }
  const pdf = new Uint8Array(await file.arrayBuffer());

  const values = certValues(cert, batch);
  const result = await sendCertificateEmail({
    to: cert.recipient_email,
    subject: mergeTokens(batch.email_subject, values),
    html: mergeTokens(batch.email_body, values),
    pdf,
    pdfFilename: `certificate-${cert.uuid}.pdf`,
    // Keyed on the job id: a backoff-retry of THIS job reuses the key (Resend
    // won't double-send), but a re-queue creates a new job → new key → sends.
    idempotencyKey: `certificate-send/${job.id}`,
  });

  if (result.ok) {
    await db.from('email_jobs').update({ status: 'done' }).eq('id', job.id);
    await db.from('certificates').update({
      status: 'sent', sent_at: new Date().toISOString(),
      attempts: job.attempts, last_error: null,
    }).eq('id', cert.id);
    await refreshBatchCounts(batch.id);
    return { processed: true, certificateId: cert.id, outcome: 'sent' };
  }

  // Transient + attempts remaining → back off and retry.
  if (result.transient && job.attempts < MAX_ATTEMPTS) {
    const backoffSec = Math.min(300, 15 * Math.pow(2, job.attempts - 1)); // 15s, 30s, 60s…
    await db.from('email_jobs').update({
      status: 'pending',
      scheduled_for: new Date(Date.now() + backoffSec * 1000).toISOString(),
    }).eq('id', job.id);
    await db.from('certificates').update({
      status: 'queued', attempts: job.attempts, last_error: result.error ?? 'transient error',
    }).eq('id', cert.id);
    return { processed: true, certificateId: cert.id, outcome: 'retry', error: result.error };
  }

  return finalizeFailure(db, job, cert, batch.id, result.error ?? 'send failed', job.attempts);
}

async function finalizeFailure(
  db: ReturnType<typeof getAdminClient>,
  job: EmailJob,
  cert: Certificate,
  batchId: string,
  error: string,
  attempts = job.attempts
): Promise<TickResult> {
  await db.from('email_jobs').update({ status: 'failed' }).eq('id', job.id);
  await db.from('certificates')
    .update({ status: 'failed', attempts, last_error: error }).eq('id', cert.id);
  await refreshBatchCounts(batchId);
  return { processed: true, certificateId: cert.id, outcome: 'failed', error };
}

// ── Batch counts / completion ──────────────────────────────────────────────────

export async function refreshBatchCounts(batchId: string): Promise<void> {
  const db = getAdminClient();

  const count = async (filter?: (q: ReturnType<typeof baseCount>) => typeof q) => {
    let q = baseCount();
    if (filter) q = filter(q);
    const { count: c } = await q;
    return c ?? 0;
  };
  function baseCount() {
    return db.from('certificates').select('id', { count: 'exact', head: true }).eq('batch_id', batchId);
  }

  const total = await count();
  const sent = await count((q) => q.eq('status', 'sent'));
  const failed = await count((q) => q.eq('status', 'failed'));

  // Jobs for this batch: total ever created, and how many are still in flight.
  const { count: totalJobs } = await db
    .from('email_jobs').select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId);
  const { count: active } = await db
    .from('email_jobs').select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId).in('status', ['pending', 'processing']);

  const updates: Partial<Batch> = {
    total_count: total, sent_count: sent, failed_count: failed,
  };

  // Complete only when a sending batch has drained REAL queued work — never when
  // no jobs were ever enqueued (guards against a false "completed" on an empty start).
  const { data: batch } = await db
    .from('batches').select('status').eq('id', batchId).single<Pick<Batch, 'status'>>();
  if (batch?.status === 'sending' && (totalJobs ?? 0) > 0 && (active ?? 0) === 0) {
    updates.status = 'completed';
  }

  await db.from('batches').update(updates).eq('id', batchId);
}
