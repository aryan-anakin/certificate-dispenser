'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900';
const labelCls = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1';

const DEFAULT_PLACEHOLDERS = JSON.stringify(
  {
    name: { x: 421, y: 320, fontSize: 36, color: '#1a1a1a', align: 'center', font: 'Helvetica-Bold' },
    event: { x: 421, y: 270, fontSize: 16, color: '#555555', align: 'center' },
  },
  null,
  2
);
const DEFAULT_QR = JSON.stringify({ x: 700, y: 60, size: 90 }, null, 2);

export default function TemplateUploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/templates', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } else {
      setError(body.error ?? 'Upload failed');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Upload template</h2>

      <div>
        <label className={labelCls}>Template name</label>
        <input name="name" required placeholder="Workshop certificate A4" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>File (PNG / JPG / PDF)</label>
        <input
          name="file"
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          required
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm dark:text-zinc-400 dark:file:bg-zinc-800"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Width (pt)</label>
          <input name="width" type="number" defaultValue={842} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Height (pt)</label>
          <input name="height" type="number" defaultValue={595} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Placeholders (JSON)</label>
        <textarea name="placeholders" rows={8} defaultValue={DEFAULT_PLACEHOLDERS} className={`${inputCls} font-mono text-xs`} />
        <p className="mt-1 text-xs text-zinc-400">
          Token → {'{ x, y, fontSize, color, align, font }'}. Coordinates are PDF points from the
          bottom-left. <code>name</code> is the recipient; <code>event</code> is the batch name;
          other tokens map to spreadsheet columns.
        </p>
      </div>

      <div>
        <label className={labelCls}>QR position (JSON)</label>
        <textarea name="qr_position" rows={4} defaultValue={DEFAULT_QR} className={`${inputCls} font-mono text-xs`} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? 'Uploading…' : 'Upload template'}
      </button>
    </form>
  );
}
