const COLORS: Record<string, string> = {
  // certificate
  pending: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  generated: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  queued: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  sending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  sent: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  revoked: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  // batch
  draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  generating: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  ready: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  paused: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? COLORS.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}
    >
      {status}
    </span>
  );
}
