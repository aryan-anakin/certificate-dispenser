import Link from 'next/link';
import BatchDetail from '@/components/BatchDetail';

export default async function BatchPage({ params }: PageProps<'/admin/batches/[id]'>) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Batches
      </Link>
      <BatchDetail batchId={id} />
    </div>
  );
}
