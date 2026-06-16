'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Template } from '@/types';

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900';
const labelCls = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1';

export default function NewBatchForm({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/batches', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      router.push(`/batches/${body.batch.id}`);
      router.refresh();
    } else {
      setError(body.error ?? 'Failed to create batch');
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        + New batch
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">New batch</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-zinc-400">
          Cancel
        </button>
      </div>

      <div>
        <label className={labelCls}>Batch name</label>
        <input name="name" required placeholder="AWS Workshop — June 2026" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Recipients (.xlsx / .csv)</label>
        <input
          name="file"
          type="file"
          accept=".xlsx,.xls,.csv"
          required
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm dark:text-zinc-400 dark:file:bg-zinc-800"
        />
        <p className="mt-1 text-xs text-zinc-400">
          Must include <code>name</code> and <code>email</code> columns. Extra columns become
          custom fields.
        </p>
      </div>

      <div>
        <label className={labelCls}>Template</label>
        <select name="template_id" className={inputCls} defaultValue="">
          <option value="">Default certificate (no template)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Email subject</label>
          <input
            name="email_subject"
            defaultValue="Your certificate for {{event}}"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Send interval (seconds)</label>
          <input
            name="send_interval_seconds"
            type="number"
            min={0}
            defaultValue={30}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Email body (HTML, supports {'{{name}}'} etc.)</label>
        <textarea
          name="email_body"
          rows={4}
          defaultValue={
            'Hi {{name}},<br/><br/>Congratulations! Your certificate is attached.<br/>Verify it any time at {{verification_url}}.'
          }
          className={inputCls}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create batch'}
      </button>
    </form>
  );
}
