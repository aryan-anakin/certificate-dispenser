// Resend send wrapper. Same interface as the old SendGrid wrapper so the queue
// only needs to swap the import. Classifies failures as transient (retry) vs
// permanent (give up) so the worker can make the right call.

import { Resend } from 'resend';

export interface SendResult {
  ok: boolean;
  transient: boolean; // only meaningful when ok === false
  error?: string;
}

export interface SendCertificateEmailInput {
  to: string;
  subject: string;
  html: string;
  pdf: Uint8Array;
  pdfFilename: string;
  /**
   * Idempotency key (<= 256 chars, expires after 24h). Resend de-dupes sends
   * with the same key, so a retry of the *same* queued job never double-sends,
   * while a genuine re-queue (new job id) sends fresh.
   */
  idempotencyKey?: string;
}

// Resend's shared sender works with no domain setup, but can only deliver to
// the email you registered your Resend account with. Verify a domain to send
// to anyone else (see docs/SETUP.md).
const DEFAULT_FROM = 'onboarding@resend.dev';

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendCertificateEmail(
  input: SendCertificateEmailInput
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const fromName = process.env.RESEND_FROM_NAME ?? 'Certificates';

  if (!apiKey) {
    return { ok: false, transient: false, error: 'Resend not configured (missing RESEND_API_KEY).' };
  }

  const resend = new Resend(apiKey);

  // The SDK returns { data, error } for API-level problems (we handle those
  // below). The try/catch only covers network-level throws, per Resend's docs.
  try {
    const { data, error } = await resend.emails.send(
      {
        from: `${fromName} <${fromEmail}>`,
        to: input.to,
        subject: input.subject,
        html: input.html,
        // Plain-text fallback derived from the HTML.
        text: input.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        attachments: [
          {
            filename: input.pdfFilename,
            content: Buffer.from(input.pdf),
          },
        ],
      },
      // idempotencyKey is a second-argument option in the v6 SDK.
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
    );

    if (error) {
      return { ok: false, transient: isTransient(error.name), error: formatError(error) };
    }
    if (!data?.id) {
      // No id and no error shouldn't happen, but treat as transient to allow a retry.
      return { ok: false, transient: true, error: 'Resend returned no message id.' };
    }
    return { ok: true, transient: false };
  } catch (err: unknown) {
    // Network / unexpected throw — retry.
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, transient: true, error: msg };
  }
}

// Resend error codes worth retrying. Quota errors (daily/monthly) and validation
// errors (bad address, unverified sender) are permanent — retrying won't help.
function isTransient(name?: string): boolean {
  if (!name) return false;
  return (
    name === 'rate_limit_exceeded' ||
    name === 'internal_server_error' ||
    name === 'application_error' ||
    name === 'concurrent_idempotent_requests'
  );
}

function formatError(error: { name?: string; message?: string }): string {
  return `${error.name ?? 'error'}: ${error.message ?? 'unknown'}`.slice(0, 800);
}
