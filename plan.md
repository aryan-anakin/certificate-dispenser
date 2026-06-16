# Certificate Dispenser — Build Plan

> A web application that ingests an Excel sheet of recipients and a certificate template, generates a uniquely-identified PDF certificate for each person, hosts a public QR-verifiable page per certificate, and emails certificates autonomously at a user-defined interval via SendGrid.

This document is written to be handed directly to Claude Code (or any engineer) as the build spec. It defines scope, architecture, data model, APIs, file layout, and a phased implementation plan.

---

## 1. Goal & Scope

### In scope (v1)

1. **Upload inputs:** an Excel sheet of recipients (name, email, plus optional custom columns) and a certificate template.
2. **Per-certificate UUID:** every certificate gets a cryptographically-random UUID, embedded in a QR code, that resolves to a public verification page.
3. **PDF generation:** render a personalized PDF certificate per recipient from the template + row data + QR code.
4. **Public verification:** `mysite.com/verification/<uuid>` is scannable by any QR reader and shows the certificate's authenticity and details, fetched from the database.
5. **Autonomous email sending:** send certificates one-by-one through SendGrid with a user-defined interval between sends; the job is resumable and tracks per-recipient status.
6. **Batch dashboard:** see progress (pending / sent / failed) and re-send to individuals.

### Out of scope (v1, candidate for later)

- Multi-tenant SaaS / public sign-ups (start single-org or single-user behind simple auth).
- Drag-and-drop visual template editor (v1 uses a defined placeholder mapping).
- Certificate expiry, paid plans, advanced analytics, multi-language emails.

### Non-negotiable design rules

- UUIDs are **random (UUID v4)**, never sequential — verification URLs must not be guessable/enumerable.
- The verification page is a **public read** of a single record. It must never expose recipient email or PII beyond what the issuer chooses to show.
- Email sending is **throttled and resumable** — if the process restarts mid-batch it continues, never re-sending a certificate already marked `sent`.

---

## 2. Tech Stack

| Layer           | Choice                                            | Notes                                                                                                                                  |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | **Next.js (App Router) + TypeScript**             | Single app serves UI, API routes, and the public verification page.                                                                    |
| Database        | **Supabase (Postgres)** — recommended             | Relational data fits the batch/recipient model; built-in file Storage for PDFs; simple deploys. Mongo is a fine alternative (see §10). |
| File storage    | **Supabase Storage** (bucket `certificates`)      | Stores generated PDFs; serve via signed or public URLs.                                                                                |
| Email           | **SendGrid**                                      | Transactional send with attachment + dynamic body.                                                                                     |
| PDF generation  | **pdf-lib** (recommended) or Puppeteer (HTML→PDF) | See §6 for the trade-off.                                                                                                              |
| QR codes        | **`qrcode`** npm package                          | Generate PNG/data-URL of the verification URL.                                                                                         |
| Excel parsing   | **`xlsx`** (SheetJS)                              | Parse `.xlsx`/`.csv` into rows.                                                                                                        |
| Background work | Next.js Route Handler + a **job runner**          | A cron-triggered or self-scheduling worker drains the send queue (see §7).                                                             |
| Validation      | **Zod**                                           | Validate uploads, env, API payloads.                                                                                                   |
| Styling         | Tailwind CSS                                      | Optional but fast.                                                                                                                     |

### Environment variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only, never expose to client

# SendGrid
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
SENDGRID_FROM_NAME=

# App
NEXT_PUBLIC_APP_URL=https://mysite.com   # used to build verification URLs
CRON_SECRET=                              # protects the worker endpoint
ADMIN_PASSWORD=                           # simple gate for the dashboard (v1)
```

---

## 3. High-Level Architecture

```
┌──────────────┐   upload xlsx + template    ┌──────────────────────────┐
│   Issuer UI  │ ──────────────────────────▶ │  Next.js API (App Router)│
│ (dashboard)  │                             │                          │
└──────────────┘                             │  • parse Excel (xlsx)    │
       ▲                                     │  • create Batch +        │
       │ status / progress                   │    Certificate rows      │
       │                                     │  • generate UUID + QR    │
       │                                     │  • render PDF (pdf-lib)  │
       │                                     │  • upload PDF → Storage  │
       │                                     └───────────┬──────────────┘
       │                                                 │
       │                                                 ▼
       │                                     ┌──────────────────────────┐
       │                                     │  Postgres (Supabase)     │
       │                                     │  batches / certificates  │
       │                                     │  email_jobs              │
       │                                     └───────────┬──────────────┘
       │                                                 │
┌──────┴───────┐   triggers on interval      ┌───────────▼──────────────┐
│  Send Worker │ ◀────── cron / scheduler ── │  /api/worker/tick        │
│ (drains queue│                             │  picks next due cert,    │
│  1 at a time)│ ─── SendGrid send ────────▶ │  marks sent/failed       │
└──────────────┘                             └──────────────────────────┘

         Public, no auth:
┌──────────────────────────────────────────────────────────────────────┐
│  GET /verification/<uuid>  →  reads certificate by uuid → renders      │
│  authenticity page (recipient name, title, issue date, "valid" badge) │
└──────────────────────────────────────────────────────────────────────┘
```

End-to-end lifecycle of one certificate:
`uploaded` → `generated` (PDF + QR created, stored) → `queued` → `sending` → `sent` (or `failed` → retry) → optionally `revoked`.

---

## 4. Data Model (Postgres)

### `batches`

| column                | type                  | notes                                                                      |
| --------------------- | --------------------- | -------------------------------------------------------------------------- |
| id                    | uuid (pk)             |                                                                            |
| name                  | text                  | e.g. "AWS Workshop — June 2026"                                            |
| template_id           | uuid (fk → templates) |                                                                            |
| email_subject         | text                  | supports merge tokens                                                      |
| email_body            | text                  | HTML/markdown with `{{name}}` etc.                                         |
| send_interval_seconds | int                   | user-defined delay between sends                                           |
| status                | text                  | `draft` \| `generating` \| `ready` \| `sending` \| `paused` \| `completed` |
| total_count           | int                   |                                                                            |
| sent_count            | int                   |                                                                            |
| failed_count          | int                   |                                                                            |
| created_at            | timestamptz           |                                                                            |

### `templates`

| column         | type        | notes                                                   |
| -------------- | ----------- | ------------------------------------------------------- |
| id             | uuid (pk)   |                                                         |
| name           | text        |                                                         |
| storage_path   | text        | original template file (PDF/PNG) in Storage             |
| placeholders   | jsonb       | mapping of token → {x, y, fontSize, color, align, font} |
| qr_position    | jsonb       | {x, y, size} where QR is stamped                        |
| width / height | int         | template dimensions in pt/px                            |
| created_at     | timestamptz |                                                         |

### `certificates`

| column          | type                   | notes                                                                                |
| --------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| id              | uuid (pk)              |                                                                                      |
| uuid            | uuid (unique, indexed) | **public id used in verification URL + QR**                                          |
| batch_id        | uuid (fk)              |                                                                                      |
| recipient_name  | text                   |                                                                                      |
| recipient_email | text                   |                                                                                      |
| custom_fields   | jsonb                  | extra Excel columns (course, date, grade…)                                           |
| pdf_path        | text                   | Storage path of generated PDF                                                        |
| status          | text                   | `pending` \| `generated` \| `queued` \| `sending` \| `sent` \| `failed` \| `revoked` |
| attempts        | int                    | retry counter                                                                        |
| last_error      | text                   | last failure reason                                                                  |
| issued_at       | timestamptz            |                                                                                      |
| sent_at         | timestamptz            |                                                                                      |
| created_at      | timestamptz            |                                                                                      |

### `email_jobs` (queue)

| column         | type        | notes                                                            |
| -------------- | ----------- | ---------------------------------------------------------------- |
| id             | uuid (pk)   |                                                                  |
| certificate_id | uuid (fk)   |                                                                  |
| batch_id       | uuid (fk)   |                                                                  |
| scheduled_for  | timestamptz | now + interval; worker picks rows where `scheduled_for <= now()` |
| status         | text        | `pending` \| `processing` \| `done` \| `failed`                  |
| attempts       | int         |                                                                  |
| created_at     | timestamptz |                                                                  |

> Index `certificates.uuid`, `certificates.batch_id`, and `email_jobs (status, scheduled_for)`.

---

## 5. API Routes (App Router)

All write/admin routes are gated by simple auth (v1: `ADMIN_PASSWORD` cookie/session). Public routes are explicitly marked.

| Method & Path                       | Purpose                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/templates`               | Upload a template file + placeholder mapping → row in `templates`.                                                                 |
| `GET /api/templates`                | List templates.                                                                                                                    |
| `POST /api/batches`                 | Create batch: accepts Excel upload + templateId + email config + interval. Parses rows, creates `certificates` (status `pending`). |
| `POST /api/batches/:id/generate`    | Generate PDFs + QR for all pending certs in the batch; upload to Storage; set status `generated`.                                  |
| `POST /api/batches/:id/start`       | Enqueue `email_jobs` with staggered `scheduled_for` based on interval; set batch `sending`.                                        |
| `POST /api/batches/:id/pause`       | Stop the worker from picking up this batch.                                                                                        |
| `GET /api/batches/:id`              | Batch detail + per-recipient status (for dashboard polling).                                                                       |
| `POST /api/certificates/:id/resend` | Re-queue a single failed/individual certificate.                                                                                   |
| `POST /api/certificates/:id/revoke` | Mark `revoked`; verification page then shows invalid.                                                                              |
| `GET /api/verify/:uuid`             | **Public.** Returns sanitized cert data (name, title, issue date, status). No email/PII.                                           |
| `POST /api/worker/tick`             | **Protected by `CRON_SECRET`.** Picks the next due job, sends it via SendGrid, updates status. Idempotent.                         |

### Public page (not an API)

- `GET /verification/[uuid]` — server component that calls the verify logic and renders the authenticity page. This is the QR target.

---

## 6. PDF + QR Generation

**Recommended approach — `pdf-lib`:**

1. Load the template (if PDF, use directly; if PNG/JPG, embed it as a full-page image).
2. For each placeholder in `templates.placeholders`, draw text from the recipient row at the configured `{x, y}`, font, size, color, alignment.
3. Generate the QR as a PNG from `${APP_URL}/verification/${uuid}` using `qrcode`, embed it at `qr_position`.
4. Save bytes, upload to Storage at `certificates/<batch_id>/<uuid>.pdf`, store `pdf_path`.

**Alternative — Puppeteer (HTML→PDF):** define the certificate as an HTML/CSS template and screenshot to PDF. More flexible visually but heavier to deploy (needs a headless Chromium; on Vercel use `@sparticuz/chromium`). Choose this only if templates need rich HTML layout. For "template image + name + QR", `pdf-lib` is lighter and the recommended default.

**Placeholder mapping format (`templates.placeholders`):**

```json
{
  "name": {
    "x": 400,
    "y": 300,
    "fontSize": 36,
    "color": "#1a1a1a",
    "align": "center",
    "font": "Helvetica-Bold"
  },
  "date": {
    "x": 400,
    "y": 250,
    "fontSize": 16,
    "color": "#555555",
    "align": "center"
  }
}
```

Provide a small **preview endpoint/UI** that renders one sample cert so the issuer can adjust coordinates before generating the whole batch.

---

## 7. Email Queue & Autonomous Sending

The core of requirement #3. Design for throttled, resumable, one-at-a-time delivery.

**Enqueue (on `start`):** for each generated certificate, insert an `email_jobs` row with
`scheduled_for = now() + (index * send_interval_seconds)`. This staggers the whole batch up front.

**Worker (`POST /api/worker/tick`):**

1. Auth via `CRON_SECRET`.
2. `SELECT ... FROM email_jobs WHERE status='pending' AND scheduled_for <= now() ORDER BY scheduled_for LIMIT 1 FOR UPDATE SKIP LOCKED` (row lock prevents double-send).
3. Mark `processing`, set certificate `sending`.
4. Fetch the PDF from Storage, build the email (merge tokens into subject/body), send via SendGrid with the PDF attached **and** a link to the hosted verification page.
5. On success: job `done`, certificate `sent` + `sent_at`, increment `batches.sent_count`.
6. On failure: increment `attempts`; if under retry cap, leave `pending` with a backoff `scheduled_for`; else mark `failed`, store `last_error`, increment `failed_count`.
7. When no pending jobs remain for a batch, set batch `completed`.

**Triggering the worker — pick one:**

- **Supabase scheduled function / external cron** hitting `/api/worker/tick` every N seconds/minutes (simplest, robust).
- **Vercel Cron** (minimum 1-minute granularity — fine if intervals ≥ 1 min).
- For sub-minute intervals, run a small **standalone Node worker** that loops with the configured delay and calls the tick logic directly.

> Because sending is keyed off `scheduled_for` in the DB, restarts are safe: the worker always resumes from the next due, unsent job. Already-`sent` certs are never re-sent.

**Deliverability notes:** authenticate the sending domain in SendGrid (SPF/DKIM), keep intervals reasonable, handle SendGrid 4xx/5xx distinctly (retry transient, fail permanent like invalid address).

---

## 8. Verification Page (`/verification/<uuid>`)

- Server component; fetches the certificate by `uuid`.
- **Valid:** show a green "Verified" badge, recipient name, certificate title/event, issue date, issuing organization, and (optional) a thumbnail / "Download PDF" link. Offer an **"Add to LinkedIn"** button.
- **Revoked:** red "This certificate has been revoked."
- **Not found:** neutral "No certificate matches this code."
- Returns only sanitized fields — never the recipient's email or raw `custom_fields` unless explicitly whitelisted for display.
- Add `noindex` if certs should not appear in search engines.

---

## 9. File / Folder Layout

```
certificate-dispenser/
├─ app/
│  ├─ (dashboard)/
│  │  ├─ page.tsx                  # batches list
│  │  ├─ batches/[id]/page.tsx     # batch detail + progress (polls API)
│  │  └─ templates/page.tsx        # upload + map placeholders + preview
│  ├─ verification/[uuid]/page.tsx # PUBLIC authenticity page (QR target)
│  └─ api/
│     ├─ templates/route.ts
│     ├─ batches/route.ts
│     ├─ batches/[id]/generate/route.ts
│     ├─ batches/[id]/start/route.ts
│     ├─ batches/[id]/pause/route.ts
│     ├─ certificates/[id]/resend/route.ts
│     ├─ certificates/[id]/revoke/route.ts
│     ├─ verify/[uuid]/route.ts
│     └─ worker/tick/route.ts
├─ lib/
│  ├─ supabase.ts                  # server + admin clients
│  ├─ excel.ts                     # parse + validate rows (xlsx + zod)
│  ├─ pdf.ts                       # pdf-lib generation
│  ├─ qr.ts                        # qrcode generation
│  ├─ sendgrid.ts                  # email send wrapper
│  ├─ queue.ts                     # enqueue + tick logic
│  └─ auth.ts                      # simple admin gate
├─ db/
│  └─ schema.sql                   # tables + indexes (or supabase migrations)
├─ types/
│  └─ index.ts
├─ .env.local.example
└─ README.md
```

---

## 10. Alternative: MongoDB instead of Supabase

If you prefer Mongo:

- Replace tables with collections (`batches`, `templates`, `certificates`, `email_jobs`); keep the same fields.
- Use a separate object store for PDFs (e.g. **Cloudflare R2 / AWS S3**) since Mongo isn't ideal for binaries — Supabase's built-in Storage is the main convenience you'd give up.
- Use `findOneAndUpdate` with a status filter to atomically claim a queue job (Mongo's equivalent of `FOR UPDATE SKIP LOCKED`).
- For sub-minute scheduling, the standalone-worker approach is the same.

**Recommendation:** start with **Supabase** — relational model + built-in Storage + easy Vercel deploy removes the most moving parts for v1.

---

## 11. Phased Implementation Plan

**Phase 0 — Scaffold**

- Next.js + TS + Tailwind app; env validation with Zod; Supabase project + `schema.sql`; Storage bucket `certificates`.

**Phase 1 — Templates & Excel**

- Template upload + placeholder mapping UI; Excel parse (`xlsx`) → validated rows; create batch + `pending` certificates.

**Phase 2 — Generation**

- `pdf.ts` + `qr.ts`; single-cert **preview**; batch generate → upload PDFs → status `generated`. Verify QR resolves to a placeholder verification page.

**Phase 3 — Verification page**

- Public `/verification/[uuid]` reading real data; valid / revoked / not-found states; LinkedIn add button.

**Phase 4 — Email queue**

- SendGrid wrapper; enqueue on `start` with staggered `scheduled_for`; `/api/worker/tick` with row-locking, retries, status updates; wire cron/worker.

**Phase 5 — Dashboard & controls**

- Batch progress polling; per-recipient table; resend / revoke / pause.

**Phase 6 — Hardening**

- SendGrid domain auth (SPF/DKIM); rate-limit public verify; `noindex`; admin gate; basic logging/metrics; idempotency tests for the worker.

---

## 12. Acceptance Criteria (Definition of Done for v1)

- [ ] Upload an `.xlsx` of N recipients + a template, and N PDFs are generated, each with a unique UUID and a scannable QR.
- [ ] Scanning any certificate's QR with a phone opens `mysite.com/verification/<uuid>` and shows correct, sanitized details.
- [ ] Starting the batch sends emails one-by-one at the configured interval, each with the PDF attached.
- [ ] Killing and restarting the worker mid-batch resumes without re-sending or skipping anyone.
- [ ] A failed send is visible in the dashboard and can be re-sent individually.
- [ ] Revoking a certificate flips its verification page to "revoked."

---

## 13. Open Questions for the Issuer (decide before/early in build)

1. Does the dashboard need real multi-user auth, or is a single admin password fine for v1?
2. Minimum send interval needed? (Determines cron vs. standalone worker — see §7.)
3. Should the verification page show a PDF thumbnail/download, or just text details?
4. Expected batch size (hundreds vs. tens of thousands)? Affects generation strategy (sync vs. background) and SendGrid plan.
