# Certificate Dispenser

Upload a spreadsheet of recipients + (optionally) a certificate template, generate
a uniquely-identified PDF certificate per person with a QR code, host a public
QR-verifiable page for each certificate, and email them autonomously through
Resend at a user-defined interval. Sending is throttled and **resumable** — kill
the worker mid-batch and it picks up exactly where it left off, never re-sending.

Built on **Next.js 16 (App Router) + TypeScript + Tailwind**, **Supabase**
(Postgres + Storage), **pdf-lib**, **qrcode**, **xlsx**, and **Resend**.

---

## 1. Prerequisites you provide

You said you'd handle keys/setup — here's exactly what's needed.

> **New here? Follow [`docs/SETUP.md`](./docs/SETUP.md)** — a click-by-click guide
> that takes anyone from a fresh clone to sending a real certificate in ~20 min.
> The summary below is the short version.

### Supabase
1. Create a Supabase project.
2. **SQL**: open the SQL editor and run [`db/schema.sql`](./db/schema.sql). It creates
   the `templates`, `batches`, `certificates`, `email_jobs` tables, indexes, and the
   atomic `claim_next_email_job()` queue function.
3. **Storage**: create a **private** bucket named `certificates` (Storage → New bucket).
   Generated PDFs and uploaded templates both live here; the public verification page
   serves PDFs via short-lived signed URLs, so the bucket stays private.

### Resend
1. Create an API key (Resend → API Keys). Starts with `re_`.
2. To send to real recipients (not just your own Resend account email), add and
   verify a domain in Resend and set `RESEND_FROM_EMAIL` to an address on it.

### Environment
Copy the example and fill it in (see [`docs/SETUP.md`](./docs/SETUP.md) for where
each value comes from):

```bash
cp .env.example .env.local
```

| Variable | What it's for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project URL + anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key (all DB/Storage access). **Never expose to the client.** |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` | Email sending key + sender identity |
| `NEXT_PUBLIC_APP_URL` | Public base URL used to build verification + QR links |
| `CRON_SECRET` | Shared secret protecting the worker endpoint |
| `ADMIN_PASSWORD` | Simple gate for the dashboard. **If unset, the dashboard runs open (dev only).** |

The app boots even before these are set — the dashboard shows a banner listing what's
missing, and operations that need a service throw a clear error rather than crashing.

---

## 2. Run it

```bash
npm install            # already done
npm run dev            # runs the app + send worker together → http://localhost:3000
```

`npm run dev` starts **both** the Next.js app and the send worker in one terminal
(prefixed `web` / `worker`; Ctrl+C stops both). To run them separately:
`npm run dev:web` (app only) and `npm run worker` (worker only).

The worker reads `NEXT_PUBLIC_APP_URL` + `CRON_SECRET` from `.env.local` and repeatedly
calls `POST /api/worker/tick`. In production you don't run the worker process — point a
cron (Supabase scheduled function / Vercel Cron / any scheduler) at that endpoint with the
`Authorization: Bearer <CRON_SECRET>` header instead.

---

## 3. End-to-end flow

1. **(Optional) Templates** → upload a PNG/JPG/PDF and a placeholder map (JSON). Tokens:
   `name` (recipient), `event` (batch name), and any spreadsheet column. Coordinates are
   PDF points from the **bottom-left**. With no template, a clean default certificate is used.
2. **Batches** → **New batch**: upload an `.xlsx`/`.csv` with `name` + `email` columns
   (extra columns become custom fields), pick a template, set the email subject/body
   (supports `{{name}}`, `{{event}}`, `{{verification_url}}`, …) and the send interval.
3. On the batch page: **1 · Generate PDFs** (renders + uploads each PDF, stamps the QR),
   then **2 · Start sending** (staggers `email_jobs` by the interval).
4. The **worker** sends them one-by-one. Progress updates live; **Pause/Resume**, **resend**
   a single recipient, or **revoke** a certificate at any time.
5. Scanning any certificate's QR opens `/<APP_URL>/verification/<uuid>` — a public page
   showing a verified badge, recipient, title, issue date, a PDF download, and an
   "Add to LinkedIn" button. Revoked certs show "revoked"; unknown codes show "not found".

---

## 4. How resumability works

Sending is keyed off `email_jobs.scheduled_for`. The worker claims the next due job with
`claim_next_email_job()`, which uses `SELECT … FOR UPDATE SKIP LOCKED` so two workers never
grab the same job. On success the certificate is marked `sent`; the idempotency check means a
restart never re-sends it. Transient Resend failures (rate limits / 5xx) back off and retry up
to 3×; permanent ones (bad address, etc.) are marked `failed` and surfaced in the dashboard for resend.

---

## 5. Prototype scope / hardening TODO

This is a working v1 prototype. Before production, see `plan.md` §6/§11 and:

- **RLS**: schema leaves Row Level Security off (all access is server-side via the service
  role). Enable RLS and expose only a sanitized public read of `certificates` for verification.
- Rate-limit the public verify endpoint; add real auth if multi-user is needed.
- Move large-batch generation to a background job; current generation runs synchronously.
- Resend domain verification (SPF/DKIM) for deliverability to real recipients.

---

## Project layout

```
app/
  admin/                  gated dashboard (/admin): batches list, batch detail, templates
  verification/[uuid]/    PUBLIC authenticity page (QR target)
  login/                  admin password gate
  api/                    route handlers (templates, batches, certificates, verify, worker)
lib/                      supabase, excel, pdf, qr, resend, queue, verify, auth
components/               client UI (forms, batch detail, badges)
db/schema.sql             tables, indexes, atomic queue claim function
scripts/worker.mjs        standalone queue drainer for local dev
types/                    shared domain types
```
