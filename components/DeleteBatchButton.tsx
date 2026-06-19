'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteBatchButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (
      !window.confirm(
        `Delete batch “${name}”? This permanently removes all its certificates and generated PDFs. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/batches/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      window.alert(body.error ?? 'Failed to delete batch');
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className="shrink-0 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      {busy ? 'deleting…' : 'delete'}
    </button>
  );
}
