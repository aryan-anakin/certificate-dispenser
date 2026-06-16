// Server-side Supabase clients. Do NOT import this from a Client Component —
// it reads the service role key, which must never reach the browser.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const CERTS_BUCKET = 'certificates';

let cached: SupabaseClient | null = null;

/**
 * Admin client using the service role key. Bypasses RLS — server only.
 * Lazily constructed so the app boots even before env is configured;
 * throws a clear error the first time it is actually used without keys.
 */
export function getAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example / docs/SETUP.md).'
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
