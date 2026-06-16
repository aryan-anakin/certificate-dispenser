# Setup Guide

This walks you from a fresh clone to sending a real certificate, step by step.
No prior knowledge of Supabase or Resend is assumed. Budget ~20 minutes.

By the end you'll have filled in **one file** (`.env.local`) with 8 values. The
table at the bottom is the quick reference; the sections explain where each value
comes from.

---

## 0. Prerequisites

- **Node.js 20 or newer** — check with `node -v`. (Get it from <https://nodejs.org>.)
- A **Supabase** account (free tier is fine) — <https://supabase.com>.
- A **Resend** account (free tier sends 100 emails/day) — <https://resend.com>.

Install dependencies once:

```bash
npm install
```

Create your local env file from the template:

```bash
cp .env.example .env.local
```

You'll edit `.env.local` as you go. **Never commit it** — it holds secrets and is
already gitignored.

> Tip: after editing `.env.local`, restart the dev server (`Ctrl+C`, then
> `npm run dev`). Environment variables are read at startup.

---

## 1. Supabase — database + file storage

### 1a. Create a project
1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Give it a name, set a database password (save it somewhere), pick a region
   close to you, and create it. Wait ~2 minutes for it to provision.

### 1b. Copy the API keys → `.env.local`
1. In your project, open **Project Settings** (gear icon) → **API**.
2. Copy these three values into `.env.local`:

   | Dashboard field | `.env.local` variable |
   | --- | --- |
   | **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
   | Project API keys → **`anon` / `public`** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
   | Project API keys → **`service_role`** | `SUPABASE_SERVICE_ROLE_KEY` |

   > Newer Supabase projects may label these **publishable** (= anon) and
   > **secret** (= service_role) under "API Keys". Either naming works — copy the
   > public one to the anon variable and the secret one to the service_role variable.

   ⚠ The **service_role / secret** key bypasses all security rules. Keep it
   server-side only, never paste it into client code, and never commit it.

### 1c. Create the database tables
1. In the left sidebar open **SQL Editor** → **New query**.
2. Open the file [`db/schema.sql`](../db/schema.sql) in this repo, copy its entire
   contents, and paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned."

This creates the `templates`, `batches`, `certificates`, and `email_jobs` tables,
their indexes, the `claim_next_email_job()` function that makes sending resumable,
**and** the private `certificates` storage bucket. Re-running it later is safe.

### 1d. Verify the storage bucket
The schema in 1c already created a private bucket named **`certificates`**. To
confirm, open **Storage** in the sidebar — you should see it listed.

> If it's missing (e.g. you ran an older schema), create it manually: **Storage →
> New bucket →** name it exactly `certificates`, leave **Public bucket OFF**, create.
> Or run this once in the SQL editor:
> ```sql
> insert into storage.buckets (id, name, public)
> values ('certificates', 'certificates', false)
> on conflict (id) do nothing;
> ```

Generated PDFs and uploaded templates live here. The public verification page
serves PDFs through short-lived signed links, so the bucket stays private.

✅ Supabase is done.

---

## 2. Resend — sending email

We use [Resend](https://resend.com) for email. It's simpler than most providers:
no sender-verification step is required to *start*, because Resend gives you a
shared test sender.

### 2a. Create an API key → `.env.local`
1. Sign up at <https://resend.com> and go to **API Keys** → **Create API Key**.
2. Name it (e.g. `certificate-dispenser`), **Sending access** is enough, **Create**.
3. Copy the key (starts with `re_`) and paste it into `.env.local`:

   ```
   RESEND_API_KEY=re_xxxxxxxx...
   ```

### 2b. Pick a sender → `.env.local`
You have two choices:

**Option A — start instantly (no domain setup).** Use Resend's shared sender:

```
RESEND_FROM_EMAIL=onboarding@resend.dev
RESEND_FROM_NAME=Your Organization
```

> ⚠ Important limitation: with `onboarding@resend.dev`, Resend will **only deliver
> to the email address you registered your Resend account with.** Sending to any
> other recipient will be rejected. This is perfect for testing the whole flow
> against your own inbox, but not for real recipients.

**Option B — send to anyone (recommended once it works).** In Resend, go to
**Domains → Add Domain**, add your domain (e.g. `anakin.io`), and create the DNS
records it shows you (SPF/DKIM). Once it's verified, use an address on that domain:

```
RESEND_FROM_EMAIL=certs@yourdomain.com
RESEND_FROM_NAME=Your Organization
```

This also gives you proper deliverability (mail lands in the inbox, not spam).

### 2c. Quick test (optional)
Confirm your key + sender work before touching the app:

```bash
node scripts/test-resend.mjs your-resend-account-email@example.com
```

It prints `✅ SUCCESS` with a message id, or the exact Resend error.

✅ Resend is done.

---

## 3. App settings → `.env.local`

Three more values:

```bash
# 1) Where the app runs. Local dev = localhost. No trailing slash.
NEXT_PUBLIC_APP_URL=http://localhost:3000

# 2) A random secret that protects the background send endpoint.
#    Generate one on macOS/Linux:
#       openssl rand -hex 32
#    ...and paste the output here.
CRON_SECRET=paste-the-generated-string-here

# 3) Password to open the dashboard. Pick anything.
#    If you leave it BLANK, the dashboard runs with no login (OK for local dev).
ADMIN_PASSWORD=choose-a-password
```

`NEXT_PUBLIC_APP_URL` matters: it's baked into every QR code and verification link.
For local testing keep `http://localhost:3000`. When you deploy, change it to your
real domain (e.g. `https://certs.yourcompany.com`) and regenerate certificates.

---

## 4. Run it

Open **two terminals** in the project folder.

Terminal 1 — the web app:
```bash
npm run dev
```
Visit <http://localhost:3000>. If `ADMIN_PASSWORD` is set, you'll be asked to log in.

Terminal 2 — the send worker (drains the email queue):
```bash
npm run worker
```
Leave this running while you send a batch. It calls the send endpoint every few
seconds and prints what it sends. You can stop and restart it anytime — sending
resumes where it left off and never double-sends.

At the top of the dashboard, a yellow banner tells you if anything is still
missing (Supabase / Resend / admin password). No banner = you're fully set up.

---

## 5. Smoke test (send yourself a certificate)

1. A ready-made recipients file is provided: [`docs/sample-recipients.csv`](./sample-recipients.csv).
   Open it and replace the example emails with **your own email** so you receive the test.
2. In the dashboard, click **+ New batch**:
   - **Batch name**: `Test batch`
   - **Recipients**: choose your edited `sample-recipients.csv`
   - **Template**: leave as **Default certificate (no template)**
   - Leave the email fields as-is, set **Send interval** to `5` seconds.
   - Click **Create batch**.
3. On the batch page: click **1 · Generate PDFs**, wait for it to finish, then
   **2 · Start sending**.
4. Watch Terminal 2 — it logs `sent` for each recipient. Check your inbox: you'll
   get an email with the PDF attached.
5. In the email (or the recipients table) open the verification link / scan the QR
   on the PDF — it opens a public "Verified" page. Click **revoke** in the
   dashboard and refresh that page to see it flip to "revoked".

If all of that works, your environment is correctly configured. 🎉

---

## 6. Variable reference

| Variable | Required? | Where it comes from | Example |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Settings → API → Project URL | `https://abcd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase → Settings → API → anon/public key | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Settings → API → service_role/secret key | `eyJhbGci...` |
| `RESEND_API_KEY` | ✅ | Resend → API Keys | `re_xxxx...` |
| `RESEND_FROM_EMAIL` | optional | `onboarding@resend.dev`, or an address on a verified domain | `certs@you.com` |
| `RESEND_FROM_NAME` | optional | Any display name | `Acme Workshops` |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your app's base URL (no trailing slash) | `http://localhost:3000` |
| `CRON_SECRET` | ✅ | You generate it (`openssl rand -hex 32`) | `9f3c...` |
| `ADMIN_PASSWORD` | optional | You choose it (blank = open dashboard) | `s3cret` |

> The app technically only *blocks* on Supabase (`URL` + `service_role`) and
> Resend (`RESEND_API_KEY`) being present. The rest have safe dev defaults, but
> you should set all of them before deploying.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Banner: "Supabase isn't configured" | `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` missing/blank in `.env.local`. Save, then **restart `npm run dev`**. |
| Banner: "Resend isn't configured" | `RESEND_API_KEY` missing/blank. Restart dev server after fixing. |
| Generate fails: `relation "certificates" does not exist` | You didn't run `db/schema.sql` (step 1c). |
| Generate fails: `Bucket not found` / storage error | The `certificates` bucket doesn't exist or is misnamed (step 1d). |
| Worker logs `failed — ...You can only send testing emails to your own email` | Using `onboarding@resend.dev` to a non-account address. Send to your Resend account email, or verify a domain (step 2b, Option B). |
| Worker logs `401 Unauthorized` | `CRON_SECRET` in `.env.local` doesn't match what the running server loaded. Restart both the dev server and the worker. |
| Emails send but QR/verify link points to the wrong place | `NEXT_PUBLIC_APP_URL` is wrong. Fix it, restart, and **re-generate** the batch (links are baked into the PDFs). |
| Changes to `.env.local` seem ignored | Env is read at startup — restart `npm run dev` (and `npm run worker`). |
| Can't log into the dashboard | Wrong `ADMIN_PASSWORD`, or you set it after the server started — restart the dev server. Blank it to disable the gate for local dev. |

Still stuck? Check the dev-server terminal — server-side errors (Supabase/Resend
messages) are printed there with the exact reason.
