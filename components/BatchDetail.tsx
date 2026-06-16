'use client';

import { useCallback, useEffect, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import type { Batch, Certificate } from '@/types';

interface Data {
  batch: Batch;
  certificates: Certificate[];
}

const btn =
  'rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const inlineInput =
  'w-60 max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900';

export default function BatchDetail({ batchId }: { batchId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Inline edit of a recipient's name / email.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/batches/${batchId}`, { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  }, [batchId]);

  // Fetch once on mount.
  // load() awaits fetch before setData, so it's not a synchronous state cascade.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Poll ONLY while there's live work to watch (generating / sending), and pause
  // when the tab is hidden. Idle batches make no requests. Manual actions still
  // refresh immediately via load() in action().
  const status = data?.batch.status;
  const isActive = status === 'sending' || status === 'generating';
  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 3000);
    return () => clearInterval(t);
  }, [isActive, load]);

  async function action(label: string, url: string) {
    setBusy(label);
    setNotice(null);
    try {
      const res = await fetch(url, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(body.error ?? 'Action failed');
      else if (label === 'generate')
        setNotice(`Generated ${body.generated}, failed ${body.failed}.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  function startEdit(c: Certificate) {
    setEditingId(c.id);
    setEditName(c.recipient_name);
    setEditEmail(c.recipient_email);
    setNotice(null);
  }

  async function saveEdit(id: string) {
    setBusy(`edit-${id}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/certificates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_name: editName.trim(),
          recipient_email: editEmail.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(body.error ?? 'Update failed');
      } else {
        setEditingId(null);
        if (body.regenerateRecommended)
          setNotice('Saved. Re-generate PDFs so the certificate shows the new name.');
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="text-sm text-zinc-500">Loading…</p>;

  const { batch, certificates } = data;
  const pct = batch.total_count ? Math.round((batch.sent_count / batch.total_count) * 100) : 0;
  const isPaused = batch.status === 'paused';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{batch.name}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {batch.total_count} recipients · interval {batch.send_interval_seconds}s
          </p>
        </div>
        <StatusBadge status={batch.status} />
      </div>

      {/* Progress */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-2 flex justify-between text-sm text-zinc-500">
          <span>{batch.sent_count} sent · {batch.failed_count} failed</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className={`${btn} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900`}
            disabled={busy !== null}
            onClick={() => action('generate', `/api/batches/${batchId}/generate`)}
          >
            {busy === 'generate' ? 'Generating…' : '1 · Generate PDFs'}
          </button>
          <button
            className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}
            disabled={busy !== null}
            onClick={() => action('start', `/api/batches/${batchId}/start`)}
          >
            {busy === 'start' ? 'Queuing…' : '2 · Start sending'}
          </button>
          <button
            className={`${btn} border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900`}
            disabled={busy !== null}
            onClick={() => action('pause', `/api/batches/${batchId}/pause`)}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
        {notice && <p className="mt-3 text-sm text-zinc-500">{notice}</p>}
      </div>

      {/* Recipients */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-400 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Recipient</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Verify</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {certificates.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5">
                  {editingId === c.id ? (
                    <div className="space-y-1.5">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Recipient name"
                        className={inlineInput}
                      />
                      <input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Email"
                        type="email"
                        className={inlineInput}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">{c.recipient_name}</div>
                      <div className="text-xs text-zinc-400">{c.recipient_email}</div>
                      {c.last_error && (
                        <div className="mt-0.5 max-w-md truncate text-xs text-red-500" title={c.last_error}>
                          {c.last_error}
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-2.5">
                  <a
                    href={`/verification/${c.uuid}`}
                    target="_blank"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    open ↗
                  </a>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-3">
                    {editingId === c.id ? (
                      <>
                        <button
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          disabled={busy !== null}
                          onClick={() => saveEdit(c.id)}
                        >
                          {busy === `edit-${c.id}` ? 'saving…' : 'save'}
                        </button>
                        <button
                          className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                          disabled={busy !== null}
                          onClick={() => setEditingId(null)}
                        >
                          cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-300"
                          disabled={busy !== null}
                          onClick={() => startEdit(c)}
                        >
                          edit
                        </button>
                        {c.status !== 'revoked' && (
                          <button
                            className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-300"
                            disabled={busy !== null}
                            onClick={() => action(`resend-${c.id}`, `/api/certificates/${c.id}/resend`)}
                          >
                            resend
                          </button>
                        )}
                        {c.status !== 'revoked' && (
                          <button
                            className="text-xs text-red-500 hover:text-red-700"
                            disabled={busy !== null}
                            onClick={() => action(`revoke-${c.id}`, `/api/certificates/${c.id}/revoke`)}
                          >
                            revoke
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
