// Direct Resend smoke test — bypasses our DB/queue/worker entirely.
// Reads RESEND_* from .env.local and tries to send one plain email, then prints
// Resend's exact response (or error). Isolates whether your key + sender work.
//
//   node scripts/test-resend.mjs you@real.com    # send to a specific address
//
// With the default sender (onboarding@resend.dev) Resend ONLY delivers to the
// email you signed up to Resend with — pass that address. To send anywhere else,
// verify a domain and set RESEND_FROM_EMAIL (see docs/SETUP.md).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resend } from 'resend';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  console.error('Could not read .env.local'); process.exit(1);
}

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const NAME = process.env.RESEND_FROM_NAME || 'Test';
const TO = process.argv[2];

if (!KEY) { console.error('Missing RESEND_API_KEY in .env.local'); process.exit(1); }
if (!TO) {
  console.error('Usage: node scripts/test-resend.mjs <recipient@email.com>');
  console.error('(With onboarding@resend.dev, use the email your Resend account is registered to.)');
  process.exit(1);
}

console.log(`From: ${NAME} <${FROM}>`);
console.log(`To:   ${TO}`);
console.log('Sending…\n');

const resend = new Resend(KEY);
const { data, error } = await resend.emails.send({
  from: `${NAME} <${FROM}>`,
  to: TO,
  subject: 'Certificate Dispenser — Resend test',
  html: '<strong>If you can read this, Resend is working.</strong>',
  text: 'If you can read this, Resend is working.',
});

if (error) {
  console.log('❌ FAILED');
  console.log('   name:   ', error.name);
  console.log('   message:', error.message);
  console.log('\nCommon causes: sender not allowed (use a verified domain, or send');
  console.log('to your own Resend account email when using onboarding@resend.dev).');
} else {
  console.log('✅ SUCCESS');
  console.log('   message id:', data?.id);
  console.log('\nIf it does not arrive: check Spam, then the Resend dashboard → Emails');
  console.log('to see whether it was delivered or bounced.');
}
