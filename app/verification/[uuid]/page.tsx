import type { Metadata } from 'next';
import Link from 'next/link';
import { verifyCertificate } from '@/lib/verify';

export const dynamic = 'force-dynamic';

// Certificates shouldn't show up in search engines.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Certificate verification',
};

// This is the QR target: authenticity check only. Downloading the PDF and
// adding to LinkedIn live on a separate page: /<uuid>/add.
export default async function VerificationPage({ params }: PageProps<'/verification/[uuid]'>) {
  const { uuid } = await params;
  const result = await verifyCertificate(uuid);

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {result.status === 'valid' && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl dark:bg-green-950">
              ✓
            </div>
            <p className="text-sm font-medium uppercase tracking-wide text-green-600">Verified</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {result.recipient_name}
            </h1>
            {result.title && (
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">{result.title}</p>
            )}
            {result.issued_at && (
              <p className="mt-3 text-xs text-zinc-400">
                Issued {new Date(result.issued_at).toLocaleDateString()}
              </p>
            )}

            <div className="mt-6">
              <Link
                href={`/${uuid}/add`}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                Download &amp; add to LinkedIn →
              </Link>
            </div>
            <p className="mt-6 break-all font-mono text-[10px] text-zinc-300 dark:text-zinc-600">
              {uuid}
            </p>
          </>
        )}

        {result.status === 'revoked' && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-3xl dark:bg-red-950">
              ✕
            </div>
            <p className="text-sm font-medium uppercase tracking-wide text-red-600">Revoked</p>
            <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              This certificate has been revoked.
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              It is no longer valid. Contact the issuer if you believe this is an error.
            </p>
          </>
        )}

        {result.status === 'not_found' && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-3xl dark:bg-zinc-800">
              ?
            </div>
            <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              No certificate matches this code.
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Check the link or QR code and try again.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
