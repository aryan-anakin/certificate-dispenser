// Standalone send worker. Repeatedly calls POST /api/worker/tick to drain the
// email queue. Safe to stop/restart anytime: sending is resumable, never doubles.
//
//   npm run worker                                  # target = WORKER_URL or NEXT_PUBLIC_APP_URL
//   npm run worker -- https://your-app.vercel.app   # drain PRODUCTION from your laptop
//   WORKER_URL=https://your-app.vercel.app npm run worker
//
// Target URL precedence: CLI arg > WORKER_URL > NEXT_PUBLIC_APP_URL > localhost.
// CRON_SECRET must match the target server's CRON_SECRET (else 401).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env.local loader (no dependency on dotenv).
try {
  const env = readFileSync(join(root, '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  /* no .env.local — rely on the ambient environment */
}

// Target: a CLI arg or WORKER_URL lets you point the local worker at production
// without changing NEXT_PUBLIC_APP_URL (which is the URL baked into certificates).
const BASE = (
  process.argv[2] ||
  process.env.WORKER_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');
const SECRET = process.env.CRON_SECRET || '';
const IDLE_MS = Number(process.env.WORKER_POLL_MS || 3000);

const headers = SECRET ? { Authorization: `Bearer ${SECRET}` } : {};

async function tickOnce() {
  const res = await fetch(`${BASE}/api/worker/tick?max=5`, { method: 'POST', headers });
  if (!res.ok) {
    console.error(`[worker] tick failed: ${res.status} ${await res.text()}`);
    return 0;
  }
  const body = await res.json();
  for (const r of body.results ?? []) {
    console.log(`[worker] ${r.outcome}${r.error ? ` — ${r.error}` : ''} (${r.certificateId ?? ''})`);
  }
  return body.processed ?? 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loop() {
  // When started alongside the dev server (npm run dev), give the web server a
  // moment to come up so the first ticks don't spam connection errors.
  await sleep(Number(process.env.WORKER_START_DELAY_MS || 2000));
  console.log(`[worker] draining ${BASE}/api/worker/tick (idle poll ${IDLE_MS}ms)`);
  let warnedDown = false;
  for (;;) {
    let processed = 0;
    try {
      processed = await tickOnce();
      warnedDown = false;
    } catch (err) {
      // Quietly tolerate "server not up yet" — only log it once.
      if (!warnedDown) {
        console.error(`[worker] waiting for ${BASE} … (${err.message})`);
        warnedDown = true;
      }
    }
    // If we just sent something, loop again immediately; else idle a bit.
    if (processed === 0) await sleep(IDLE_MS);
  }
}

loop();
