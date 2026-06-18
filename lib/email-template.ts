// Branded certificate email shell. Table-based layout with inline styles so it
// renders consistently across email clients (Gmail, Outlook, Apple Mail) which
// strip <style> blocks and don't support flexbox/grid.
//
// The issuer authors the middle message (batch.email_body, with merge tokens).
// This shell adds the header band, greeting, the Verify button, a copy-paste
// link, and the footer — so every certificate email looks consistent.

export interface CertificateEmailOptions {
  recipientName: string;
  orgName: string;
  title: string; // batch / program name
  verificationUrl: string;
  messageHtml: string; // already merge-rendered issuer body
  contactEmail?: string;
}

/** Escape text destined for HTML attribute/element context. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderCertificateEmail(opts: CertificateEmailOptions): {
  html: string;
  text: string;
} {
  const name = esc(opts.recipientName || 'there');
  const org = esc(opts.orgName || 'Certificates');
  const url = esc(opts.verificationUrl);
  const contact = opts.contactEmail ? esc(opts.contactEmail) : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header band -->
        <tr>
          <td style="background-color:#1e293b;background-image:linear-gradient(135deg,#1e3a8a 0%,#312e81 100%);padding:36px 32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="color:#c7d2fe;font-size:14px;font-weight:600;letter-spacing:0.4px;">🎓 ${org}</div>
            <div style="color:#ffffff;font-size:24px;font-weight:700;margin-top:10px;">Certificate of Completion</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:34px 40px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#374151;font-size:15px;line-height:1.65;">
            <p style="margin:0 0 18px;">Dear <strong style="color:#111827;">${name}</strong>,</p>
            <div style="margin:0 0 8px;">${opts.messageHtml}</div>
          </td>
        </tr>

        <!-- Verify button -->
        <tr>
          <td align="center" style="padding:14px 40px 6px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#2563eb" style="border-radius:8px;">
                  <a href="${url}" target="_blank"
                     style="display:inline-block;padding:13px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                    &#10003;&nbsp; Verify My Certificate
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Copy link fallback -->
        <tr>
          <td align="center" style="padding:6px 40px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="color:#9ca3af;font-size:12px;margin-bottom:4px;">Or copy this link:</div>
            <a href="${url}" target="_blank" style="color:#2563eb;font-size:12px;word-break:break-all;">${url}</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;border-top:1px solid #eef0f3;padding:20px 32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="color:#9ca3af;font-size:12px;">${org}${contact ? ` &nbsp;·&nbsp; <a href="mailto:${contact}" style="color:#9ca3af;text-decoration:none;">${contact}</a>` : ''}</div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  // Plain-text fallback derived from the message + the link.
  const messageText = opts.messageHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  const text = `Dear ${opts.recipientName || 'there'},

${messageText}

Verify your certificate: ${opts.verificationUrl}

— ${opts.orgName}${opts.contactEmail ? `\n${opts.contactEmail}` : ''}`;

  return { html, text };
}
