import { verifyCertificate } from '@/lib/verify';

// PUBLIC. Returns sanitized certificate data only (no email / PII).
export async function GET(_req: Request, ctx: RouteContext<'/api/verify/[uuid]'>) {
  const { uuid } = await ctx.params;
  try {
    const result = await verifyCertificate(uuid);
    const status = result.status === 'not_found' ? 404 : 200;
    return Response.json(result, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    // Don't leak internals on the public endpoint.
    return Response.json({ found: false, status: 'not_found' }, { status: 404 });
  }
}
