// Generate QR codes pointing at a certificate's public verification page.

import QRCode from 'qrcode';

export function verificationUrl(uuid: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  return `${base}/verification/${uuid}`;
}

/** PNG bytes of a QR code for the given certificate uuid, ready for pdf-lib. */
export async function qrPngForUuid(uuid: string): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(verificationUrl(uuid), {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512, // generous source resolution; scaled down when stamped
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
  return new Uint8Array(buf);
}

/** Data-URL form, handy for previewing a QR in the browser. */
export function qrDataUrlForUuid(uuid: string): Promise<string> {
  return QRCode.toDataURL(verificationUrl(uuid), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
  });
}
