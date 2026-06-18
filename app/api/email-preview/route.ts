import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { renderCertificateEmail } from '@/lib/email-template';

// Dev preview of the certificate email. Open in a browser:
//   http://localhost:3000/api/email-preview
// Optional query params: ?name=...&title=...&org=...&message=...
export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const q = request.nextUrl.searchParams;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

  const { html } = renderCertificateEmail({
    recipientName: q.get('name') ?? 'Aryan Bramhane',
    orgName: q.get('org') ?? process.env.RESEND_FROM_NAME ?? 'Anakin',
    title: q.get('title') ?? 'NASIKO AI Bootcamp',
    verificationUrl: `${base}/verification/00000000-0000-0000-0000-000000000000`,
    messageHtml:
      q.get('message') ??
      "Congratulations! 🎉 We're delighted to present you with your official Certificate of Completion for <strong>NASIKO AI Bootcamp</strong>.<br/><br/>Your certificate is attached to this email as a PDF. You can also verify its authenticity online at any time using the button below.<br/><br/>Thank you for your dedication and hard work throughout the program. We wish you the very best in your journey ahead.",
    contactEmail: process.env.RESEND_FROM_EMAIL || undefined,
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
