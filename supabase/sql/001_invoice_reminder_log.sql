-- LedgerFlow invoice reminder deduplication/audit log.
-- Run this in the Supabase SQL Editor before deploying the Edge Function.

create table if not exists public.invoice_reminder_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('due_soon', 'overdue')),
  -- For due_soon this is the invoice due date; for overdue it is the send/run date.
  reference_date date not null,
  recipient_email text not null,
  provider_message_id text,
  sent_at timestamptz not null default now(),
  unique (invoice_id, reminder_type, reference_date)
);

create index if not exists invoice_reminder_log_invoice_type_sent_idx
  on public.invoice_reminder_log (invoice_id, reminder_type, sent_at desc);

create index if not exists invoices_reminder_candidates_idx
  on public.invoices (due_date, status)
  where balance_due > 0;

alter table public.invoice_reminder_log enable row level security;
revoke all on public.invoice_reminder_log from anon, authenticated;
grant all on public.invoice_reminder_log to service_role;
