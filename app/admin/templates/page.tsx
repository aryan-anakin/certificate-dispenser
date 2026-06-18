import { getAdminClient } from '@/lib/supabase';
import TemplateUploadForm from '@/components/TemplateUploadForm';
import DeleteTemplateButton from '@/components/DeleteTemplateButton';
import type { Template } from '@/types';

export const dynamic = 'force-dynamic';

async function loadTemplates(): Promise<{ templates: Template[]; error?: string }> {
  try {
    const db = getAdminClient();
    const { data } = await db
      .from('templates').select('*').order('created_at', { ascending: false }).returns<Template[]>();
    return { templates: data ?? [] };
  } catch (err) {
    return { templates: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function TemplatesPage() {
  const { templates, error } = await loadTemplates();

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Templates</h1>
        {error && (
          <p className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
            Could not load templates: {error}
          </p>
        )}
        {templates.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
            No templates yet. Upload one, or create a batch with the default certificate.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{t.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {t.file_type} · {t.width}×{t.height}pt · {Object.keys(t.placeholders ?? {}).length} placeholders
                  </p>
                </div>
                <DeleteTemplateButton id={t.id} name={t.name} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <TemplateUploadForm />
    </div>
  );
}
