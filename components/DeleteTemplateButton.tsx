'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Delete template “${name}”? Batches using it will fall back to the default certificate.`)) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      window.alert(body.error ?? 'Failed to delete template');
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      {busy ? 'deleting…' : 'delete'}
    </button>
  );
}
