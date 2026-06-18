// Render a personalized certificate PDF from a template + row data + QR code.
// Uses pdf-lib (pure JS, no native deps).
//
// Coordinate convention: PDF points from the BOTTOM-LEFT of the page, y
// increasing upward (pdf-lib native). A placeholder's {x,y} is the text
// baseline; the QR's {x,y} is its bottom-left corner.

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import type { PlaceholderMap, QrPosition, Template } from '@/types';

export interface CertificateData {
  recipientName: string;
  batchName: string;
  customFields: Record<string, string>;
  /** The certificate's public verification UUID (for the `verification_id` token). */
  certificateId?: string;
}

function hexToRgb(hex?: string): RGB {
  if (!hex) return rgb(0.1, 0.1, 0.1);
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return rgb(0.1, 0.1, 0.1);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const FONT_ALIASES: Record<string, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  'helvetica-bold': StandardFonts.HelveticaBold,
  'helvetica-oblique': StandardFonts.HelveticaOblique,
  'times-roman': StandardFonts.TimesRoman,
  'times-bold': StandardFonts.TimesRomanBold,
  'times-italic': StandardFonts.TimesRomanItalic,
  courier: StandardFonts.Courier,
  'courier-bold': StandardFonts.CourierBold,
};

class FontCache {
  private cache = new Map<string, PDFFont>();
  constructor(private doc: PDFDocument) {}
  async get(name?: string): Promise<PDFFont> {
    const key = (name ?? 'Helvetica').toLowerCase();
    const std = FONT_ALIASES[key] ?? StandardFonts.Helvetica;
    if (!this.cache.has(std)) this.cache.set(std, await this.doc.embedFont(std));
    return this.cache.get(std)!;
  }
}

/** Resolve a placeholder token to a string value from the recipient data. */
function valueForToken(token: string, data: CertificateData): string {
  const key = token.trim().toLowerCase();
  if (key === 'name') return data.recipientName;
  if (key === 'event' || key === 'title' || key === 'batch') return data.batchName;
  if (key === 'verification_id' || key === 'certificate_id' || key === 'id' || key === 'uuid')
    return data.certificateId ?? '';

  // Custom field: exact, then case-insensitive match.
  if (data.customFields[token] != null) return data.customFields[token];
  for (const [k, v] of Object.entries(data.customFields)) {
    if (k.trim().toLowerCase() === key) return v;
  }
  return '';
}

async function drawPlaceholders(
  page: PDFPage,
  fonts: FontCache,
  placeholders: PlaceholderMap,
  data: CertificateData
) {
  for (const [token, ph] of Object.entries(placeholders)) {
    const text = valueForToken(token, data);
    if (!text) continue;

    const font = await fonts.get(ph.font);
    const size = ph.fontSize ?? 24;
    const width = font.widthOfTextAtSize(text, size);

    let x = ph.x;
    if (ph.align === 'center') x = ph.x - width / 2;
    else if (ph.align === 'right') x = ph.x - width;

    page.drawText(text, { x, y: ph.y, size, font, color: hexToRgb(ph.color) });
  }
}

async function drawQr(page: PDFPage, doc: PDFDocument, qrPng: Uint8Array, pos: QrPosition) {
  if (!pos || pos.size == null) return;
  const img = await doc.embedPng(qrPng);
  page.drawImage(img, { x: pos.x, y: pos.y, width: pos.size, height: pos.size });
}

/**
 * Build the certificate PDF.
 * - template + templateBytes given: overlay onto the template (PDF or image).
 * - template null: render a clean default certificate (lets the prototype run
 *   end-to-end before any template is uploaded).
 */
export async function generateCertificatePdf(opts: {
  template: Template | null;
  templateBytes: Uint8Array | null;
  qrPng: Uint8Array;
  data: CertificateData;
}): Promise<Uint8Array> {
  const { template, templateBytes, qrPng, data } = opts;

  if (template && templateBytes) {
    const doc =
      template.file_type === 'pdf'
        ? await PDFDocument.load(templateBytes)
        : await PDFDocument.create();
    const fonts = new FontCache(doc);

    let page: PDFPage;
    if (template.file_type === 'pdf') {
      page = doc.getPages()[0];
    } else {
      page = doc.addPage([template.width, template.height]);
      const img =
        looksLikeJpg(templateBytes)
          ? await doc.embedJpg(templateBytes)
          : await doc.embedPng(templateBytes);
      page.drawImage(img, { x: 0, y: 0, width: template.width, height: template.height });
    }

    await drawPlaceholders(page, fonts, template.placeholders, data);
    await drawQr(page, doc, qrPng, template.qr_position);
    return doc.save();
  }

  return defaultCertificate(qrPng, data);
}

function looksLikeJpg(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** A presentable fallback certificate used when no template is attached. */
async function defaultCertificate(qrPng: Uint8Array, data: CertificateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const W = 842;
  const H = 595; // A4 landscape, points
  const page = doc.addPage([W, H]);
  const fonts = new FontCache(doc);

  const title = await fonts.get('Helvetica-Bold');
  const body = await fonts.get('Helvetica');
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.42, 0.45, 0.5);
  const accent = rgb(0.13, 0.4, 0.92);

  // Border
  page.drawRectangle({
    x: 24, y: 24, width: W - 48, height: H - 48,
    borderColor: accent, borderWidth: 2,
  });
  page.drawRectangle({
    x: 32, y: 32, width: W - 64, height: H - 64,
    borderColor: rgb(0.82, 0.86, 0.95), borderWidth: 1,
  });

  const center = (text: string, font: PDFFont, size: number, y: number, color = ink) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (W - w) / 2, y, size, font, color });
  };

  center('CERTIFICATE', title, 14, H - 130, accent);
  center('OF COMPLETION', body, 11, H - 150, muted);
  center('This certifies that', body, 14, H - 215, muted);
  center(data.recipientName || 'Recipient', title, 40, H - 270, ink);
  page.drawLine({
    start: { x: W / 2 - 150, y: H - 285 },
    end: { x: W / 2 + 150, y: H - 285 },
    thickness: 1, color: rgb(0.8, 0.83, 0.88),
  });
  if (data.batchName) center(`has successfully completed ${data.batchName}`, body, 14, H - 320, ink);

  // Optional custom fields, a couple of lines
  const extras = Object.entries(data.customFields).slice(0, 3);
  extras.forEach(([k, v], i) => center(`${k}: ${v}`, body, 11, H - 350 - i * 18, muted));

  // QR bottom-right with caption
  const img = await doc.embedPng(qrPng);
  const qrSize = 90;
  page.drawImage(img, { x: W - 64 - qrSize, y: 60, width: qrSize, height: qrSize });
  page.drawText('Scan to verify', {
    x: W - 64 - qrSize, y: 48, size: 8, font: body, color: muted,
  });

  return doc.save();
}
