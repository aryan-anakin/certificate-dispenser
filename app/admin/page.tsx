import Link from 'next/link';
import { getAdminClient } from '@/lib/supabase';
import StatusBadge from '@/components/StatusBadge';
import NewBatchForm from '@/components/NewBatchForm';
import type { Batch, Template } from '@/types';

export const dynamic = 'force-dynamic'; // always reflect latest DB state

async function loadData(): Promise<{ batches: Batch[]; templates: Template[]; error?: string }> {
  try {
    const db = getAdminClient();
    const [{ data: batches }, { data: templates }] = await Promise.all([
      db.from('batches').select('*').order('created_at', { ascending: false }).returns<Batch[]>(),
      db.from('templates').select('*').order('created_at', { ascending: false }).returns<Template[]>(),
    ]);
    return { batches: batches ?? [], templates: templates ?? [] };
  } catch (err) {
    return { batches: [], templates: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function BatchesPage() {
  const { batches, templates, error } = await loadData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Batches</h1>
        <NewBatchForm templates={templates} />
      </div>

      {error && (
        <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          Could not load batches: {error}
        </p>
      )}

      {batches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
          No batches yet. Create one to upload recipients and generate certificates.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
          {batches.map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/batches/${b.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{b.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {b.total_count} recipients · {b.sent_count} sent · {b.failed_count} failed
                  </p>
                </div>
                <StatusBadge status={b.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
