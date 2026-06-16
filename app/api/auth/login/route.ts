import { cookies } from 'next/headers';
import {
  SESSION_COOKIE,
  adminPasswordConfigured,
  checkPassword,
  sessionToken,
} from '@/lib/auth';

export async function POST(request: Request) {
  if (!adminPasswordConfigured()) {
    return Response.json({ ok: true, open: true });
  }

  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    /* ignore */
  }

  if (!checkPassword(password)) {
    return Response.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
