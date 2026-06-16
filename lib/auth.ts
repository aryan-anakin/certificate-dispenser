// Simple admin gate for v1: a single ADMIN_PASSWORD.
// Login compares the password and sets an httpOnly cookie holding a token
// derived from the password (so the raw password is never stored in the cookie).
// If ADMIN_PASSWORD is unset, the dashboard runs OPEN — intended for local dev.

import { createHash } from 'crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'cd_session';

export function adminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** Token stored in the session cookie when authenticated. */
export function sessionToken(): string {
  const secret = process.env.ADMIN_PASSWORD ?? '';
  return createHash('sha256').update(`cd:${secret}`).digest('hex');
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? '';
  return expected.length > 0 && candidate === expected;
}

/** True if the request carries a valid session, or if no password is set (open mode). */
export async function isAuthed(): Promise<boolean> {
  if (!adminPasswordConfigured()) return true; // open dev mode
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value === sessionToken();
}

/**
 * Guard for API route handlers. Returns a 401 Response when not authed,
 * or null when the request may proceed.
 */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAuthed()) return null;
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
