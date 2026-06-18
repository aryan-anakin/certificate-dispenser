import Link from 'next/link';
import { redirect } from 'next/navigation';
import { adminPasswordConfigured, isAuthed } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { isResendConfigured } from '@/lib/resend';
import LogoutButton from '@/components/LogoutButton';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthed())) redirect('/login');

  const openMode = !adminPasswordConfigured();
  const needsSupabase = !isSupabaseConfigured();
  const needsResend = !isResendConfigured();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold text-zinc-900 dark:text-zinc-50">
              🎓 Certificate Dispenser
            </Link>
            <Link href="/admin" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
              Batches
            </Link>
            <Link href="/admin/templates" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
              Templates
            </Link>
          </nav>
          {!openMode && <LogoutButton />}
        </div>
      </header>

      {(needsSupabase || needsResend || openMode) && (
        <div className="mx-auto mt-4 w-full max-w-5xl px-6">
          <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {needsSupabase && (
              <p>⚠ Supabase isn’t configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code>, then run <code>db/schema.sql</code>.</p>
            )}
            {needsResend && (
              <p>⚠ Resend isn’t configured. Set <code>RESEND_API_KEY</code> in <code>.env.local</code> to enable sending.</p>
            )}
            {openMode && (
              <p>⚠ No <code>ADMIN_PASSWORD</code> set — the dashboard is running open (dev mode).</p>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
