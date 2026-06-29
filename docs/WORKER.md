# Running the Send Worker from Your Laptop

A beginner-friendly guide to draining the **live** certificate queue using the
worker on your own computer, instead of a hosted cron. Budget ~5 minutes.

---

## What this is (in plain terms)

When you create a batch in the dashboard, the certificates are **queued** in the
database. Something has to actually pick them up and send them. That "something"
is the **worker**: a tiny loop that, every few seconds, calls the app's send
endpoint (`POST /api/worker/tick`). Each call sends the next few queued emails.

The worker itself doesn't send email. It just **pings** the endpoint. Whichever
server owns that endpoint does the real work (builds the PDF, calls Resend).

This guide covers one specific setup:

> **Your app is deployed (e.g. on Vercel), and you run the worker on your laptop
> as the "cron" that keeps the live queue draining.** Sending happens on the
> server; your laptop is just the scheduler.

If instead you want to run **everything** on your machine (no deployment at all),
you don't need this guide — just use `npm run dev`, which starts the app and the
worker together. See [`SETUP.md` → Run it](./SETUP.md#4-run-it).

### When to use this

- ✅ You deployed the app but don't want to set up (or pay for) a hosted cron.
- ✅ You're OK with the queue draining **only while your computer is on and the
  worker is running**. This is safe: pausing just delays sends. Nothing is lost,
  and nothing is ever sent twice (sending is resumable and idempotent).

---

## Before you start (one-time setup)

You need three things to be true.

### 1. The app is deployed and you know its URL

For this project that's the production URL, e.g.
`https://anakin-certificate.vercel.app`. Replace it with yours throughout.

### 2. Your local `CRON_SECRET` matches the deployed app's

The endpoint is protected by a shared secret. The worker sends it as
`Authorization: Bearer <CRON_SECRET>`, and the server checks it. **If the two
don't match, every tick fails with `401 Unauthorized`.**

- The deployed app's secret lives in your host's env settings (Vercel →
  Project → Settings → Environment Variables → `CRON_SECRET`).
- Your laptop's secret lives in `.env.local` → `CRON_SECRET`.

Make them identical.

### 3. Point the worker at the **canonical** URL

Add this line to `.env.local` (no trailing slash):

```bash
# Worker target. Overrides the URL the worker pings (just for the worker).
# Use the canonical domain so there's no redirect — see the warning below.
WORKER_URL=https://anakin-certificate.vercel.app
```

`WORKER_URL` only changes where the **worker** points. It does **not** change
`NEXT_PUBLIC_APP_URL`, which is the URL baked into certificate QR codes and
verification links. That's intentional: you can keep cert links on one domain
while pointing the worker at another.

> ### ⚠ The redirect trap (why "canonical" matters)
>
> Some hosting setups give the same app more than one URL, where the extras
> **redirect** to a single canonical one (e.g.
> `certificate-dispenser.vercel.app` → `anakin-certificate.vercel.app`).
>
> If the worker pings a redirecting URL, here's what happens: the worker's
> `fetch` follows the redirect automatically, but **drops the `Authorization`
> header** when the redirect points to a different hostname (a browser security
> rule). The endpoint then sees a request with **no secret** and replies
> `401 Unauthorized` — even though your secret is perfectly correct.
>
> **Fix:** always point `WORKER_URL` at the URL that responds **directly**, with
> no redirect. To find which is which:
>
> ```bash
> curl -sS -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
>   https://YOUR-URL/api/worker/tick
> ```
>
> - `307 -> https://other-host/...` → it redirects; use `other-host` instead.
> - `200` (or `401`) with an empty `->` → this URL is canonical; use it.

---

## Run it

```bash
npm run worker
```

Leave it running. You'll see something like:

```
[worker] draining https://anakin-certificate.vercel.app/api/worker/tick (idle poll 3000ms)
[worker] sent (a1b2c3d4-...)
[worker] sent (e5f6a7b8-...)
```

- It polls about every 3 seconds when the queue is empty, and faster while
  there's a backlog.
- Each tick sends up to 5 certificates.
- Press **Ctrl+C** to stop. Restart whenever you like — it resumes exactly where
  it left off and never re-sends an already-sent certificate.

### Keep it running after you close the terminal (optional)

```bash
nohup npm run worker > worker.log 2>&1 &
```

- Watch it live: `tail -f worker.log`
- Stop it: `pkill -f scripts/worker.mjs`

> Remember: draining only happens while this process is running **and** your
> computer is awake. Close the lid and sends pause until you're back.

---

## How do I know it's working?

Any one of these confirms it:

- The worker logs `sent (<id>)` lines (not `failed` or `tick failed`).
- In the dashboard, the batch's recipients flip from "queued" to "sent".
- The recipient receives the email with the PDF attached.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `[worker] tick failed: 401` | **Most common:** `WORKER_URL` points at a **redirecting** URL, so the auth header was stripped. Use the canonical URL (see *The redirect trap*). **Otherwise:** your `.env.local` `CRON_SECRET` doesn't match the deployed app's — make them identical. After editing `.env.local`, restart the worker. |
| `[worker] waiting for <url> …` | The URL is wrong or the app is unreachable/down. Confirm `WORKER_URL` is correct and that the site loads in a browser. |
| Drains, but logs `failed — You can only send testing emails to your own email address` | The **deployed** app's Resend is still in test mode (sender `onboarding@resend.dev`), so only your own Resend-account email is delivered. Verify a domain in Resend and set `RESEND_FROM_EMAIL` **on the server** (Vercel env). See [`SETUP.md` → Resend, Option B](./SETUP.md#2b-pick-a-sender--envlocal). This is a server setting; the worker can't change it. |
| Worker runs but never prints `sent`, queue not moving | The queue is empty. In the dashboard, open the batch and run **1 · Generate PDFs**, then **2 · Start sending** first. |
| Changes to `.env.local` seem ignored | The worker reads env at startup. Stop it (Ctrl+C) and run `npm run worker` again. |

---

## Note: you may already have a cloud cron

This repo ships a GitHub Action (`.github/workflows/drain-queue.yml`) that pings
the same endpoint every ~5 minutes. If you run the laptop worker **and** the
Action, that's harmless (sending is idempotent, so nothing double-sends), but
it's redundant.

- **Laptop is your cron?** You can disable the Action: Repo → **Actions** →
  *Drain certificate send queue* → ⋯ → **Disable workflow**. Keep it as a backup
  for when your computer is off.
- **Want hands-off draining?** Leave the Action enabled and skip the laptop
  worker entirely. (Note: the Action also needs the canonical URL — set the repo
  **variable** `APP_URL` to the non-redirecting domain, or its `curl` calls hit
  the same redirect and silently drain nothing.)
