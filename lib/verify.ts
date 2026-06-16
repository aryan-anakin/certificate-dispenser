// Public verification logic. Returns ONLY sanitized fields — never the
// recipient's email or raw custom_fields. Shared by the /api/verify/[uuid]
// route and the /verification/[uuid] page.

import { getAdminClient, CERTS_BUCKET } from '@/lib/supabase';
import type { Certificate, VerificationResult } from '@/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifyCertificate(uuid: string): Promise<VerificationResult> {
  if (!UUID_RE.test(uuid)) {
    return { found: false, status: 'not_found' };
  }

  const db = getAdminClient();
  const { data: cert } = await db
    .from('certificates')
    .select('uuid,status,issued_at,recipient_name,pdf_path,batch_id')
    .eq('uuid', uuid)
    .single<Pick<Certificate, 'uuid' | 'status' | 'issued_at' | 'recipient_name' | 'pdf_path' | 'batch_id'>>();

  if (!cert) return { found: false, status: 'not_found' };

  if (cert.status === 'revoked') {
    return {
      found: true,
      status: 'revoked',
      recipient_name: cert.recipient_name,
    };
  }

  // Title comes from the batch name.
  const { data: batch } = await db
    .from('batches').select('name').eq('id', cert.batch_id).single<{ name: string }>();

  // Short-lived signed URL so the holder can download their PDF (if generated).
  let pdf_url: string | null = null;
  if (cert.pdf_path) {
    const { data: signed } = await db.storage
      .from(CERTS_BUCKET).createSignedUrl(cert.pdf_path, 60 * 60);
    pdf_url = signed?.signedUrl ?? null;
  }

  return {
    found: true,
    status: 'valid',
    recipient_name: cert.recipient_name,
    title: batch?.name,
    issued_at: cert.issued_at,
    pdf_url,
  };
}
