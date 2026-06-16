-- Certificate Dispenser — Postgres schema (run in Supabase SQL editor).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

create extension if not exists "pgcrypto";          -- gen_random_uuid()

-- ── templates ───────────────────────────────────────────────────────────────
create table if not exists templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  storage_path  text not null,                       -- original template file (PDF/PNG) in Storage
  file_type     text not null default 'image',       -- 'image' | 'pdf'
  placeholders  jsonb not null default '{}'::jsonb,   -- token -> {x,y,fontSize,color,align,font}
  qr_position   jsonb not null default '{}'::jsonb,   -- {x,y,size}
  width         int  not null default 842,            -- template dimensions in pt (A4 landscape default)
  height        int  not null default 595,
  created_at    timestamptz not null default now()
);

-- ── batches ─────────────────────────────────────────────────────────────────
create table if not exists batches (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  template_id           uuid references templates(id) on delete set null,
  email_subject         text not null default 'Your certificate',
  email_body            text not null default 'Hi {{name}}, your certificate is attached. Verify it at {{verification_url}}.',
  send_interval_seconds int  not null default 30,
  status                text not null default 'draft', -- draft|generating|ready|sending|paused|completed
  total_count           int  not null default 0,
  sent_count            int  not null default 0,
  failed_count          int  not null default 0,
  created_at            timestamptz not null default now()
);

-- ── certificates ────────────────────────────────────────────────────────────
create table if not exists certificates (
  id              uuid primary key default gen_random_uuid(),
  uuid            uuid not null unique default gen_random_uuid(),  -- public id in verification URL + QR
  batch_id        uuid not null references batches(id) on delete cascade,
  recipient_name  text not null,
  recipient_email text not null,
  custom_fields   jsonb not null default '{}'::jsonb,
  pdf_path        text,
  status          text not null default 'pending',  -- pending|generated|queued|sending|sent|failed|revoked
  attempts        int  not null default 0,
  last_error      text,
  issued_at       timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- ── email_jobs (queue) ──────────────────────────────────────────────────────
create table if not exists email_jobs (
  id              uuid primary key default gen_random_uuid(),
  certificate_id  uuid not null references certificates(id) on delete cascade,
  batch_id        uuid not null references batches(id) on delete cascade,
  scheduled_for   timestamptz not null default now(),
  status          text not null default 'pending',  -- pending|processing|done|failed
  attempts        int  not null default 0,
  created_at      timestamptz not null default now()
);

-- ── indexes ─────────────────────────────────────────────────────────────────
create index if not exists certificates_uuid_idx     on certificates(uuid);
create index if not exists certificates_batch_id_idx  on certificates(batch_id);
create index if not exists email_jobs_due_idx         on email_jobs(status, scheduled_for);
create index if not exists email_jobs_batch_id_idx    on email_jobs(batch_id);

-- ── atomic queue claim ──────────────────────────────────────────────────────
-- Picks the next due, pending job and marks it `processing` in one transaction
-- using FOR UPDATE SKIP LOCKED so concurrent workers never grab the same job.
-- Skips jobs whose batch is paused. Returns 0 or 1 row.
create or replace function claim_next_email_job()
returns setof email_jobs
language plpgsql
as $$
declare
  claimed email_jobs;
begin
  select j.* into claimed
  from email_jobs j
  join batches b on b.id = j.batch_id
  where j.status = 'pending'
    and j.scheduled_for <= now()
    and b.status not in ('paused', 'completed')
  order by j.scheduled_for
  for update of j skip locked
  limit 1;

  if not found then
    return;                       -- 0 rows: nothing due
  end if;

  update email_jobs
    set status = 'processing', attempts = attempts + 1
    where id = claimed.id
    returning * into claimed;

  return next claimed;            -- exactly 1 row
end;
$$;

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Holds uploaded templates and generated certificate PDFs. Private — the app
-- reads/writes with the service role key and serves PDFs via signed URLs, so no
-- storage RLS policies are required for the prototype.
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do nothing;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- For the v1 prototype, all DB access goes through the server using the service
-- role key (which bypasses RLS), so we leave RLS off. Before production, enable
-- RLS and expose ONLY a sanitized public read of certificates for verification.
-- alter table certificates enable row level security;  -- (hardening: Phase 6)
