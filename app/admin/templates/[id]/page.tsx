import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminClient, CERTS_BUCKET } from '@/lib/supabase';
import TemplateUploadForm from '@/components/TemplateUploadForm';
import type { Template } from '@/types';

export const dynamic = 'force-dynamic';

export default async function EditTemplatePage({ params }: PageProps<'/admin/templates/[id]'>) {
  const { id } = await params;

  const db = getAdminClient();
  const { data: t } = await db.from('templates').select('*').eq('id', id).single<Template>();
  if (!t) notFound();

  // Signed URL so the editor can preview the stored image.
  const { data: signed } = await db.storage.from(CERTS_BUCKET).createSignedUrl(t.storage_path, 60 * 60);

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin/templates" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Templates
      </Link>
      <p className="text-xs text-zinc-400">
        Template ID: <span className="font-mono select-all">{t.id}</span>
      </p>
      <TemplateUploadForm
        edit={{
          id: t.id,
          name: t.name,
          imageUrl: signed?.signedUrl ?? '',
          fileType: t.file_type,
          width: t.width,
          height: t.height,
          placeholders: t.placeholders,
          qrPosition: t.qr_position?.size ? t.qr_position : null,
        }}
      />
    </div>
  );
}
