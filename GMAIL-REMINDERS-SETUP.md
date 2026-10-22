# LedgerFlow free Gmail invoice reminders

This edition uses Google Apps Script's `MailApp` to send emails from the Google account that authorizes the script. It does not require Resend or a purchased sending domain. Gmail/Apps Script quotas apply; check the official quota page before broad use: https://developers.google.com/apps-script/guides/services/quotas

## What it does

- Sends a polite reminder for invoices due in 1–3 days (one successful reminder per invoice due date; the window allows recovery if a scheduled run was missed).
- Sends an overdue follow-up for an outstanding invoice, then at most once every 7 days.
- Skips draft, cancelled, and paid invoices, invoices without a client email, and invoices with no outstanding balance.
- Uses the existing `public.invoice_reminder_log` table to prevent duplicates.
- Includes invoice number, due date, total, outstanding balance, client name, company sign-off, and the light-green/white/charcoal LedgerFlow design.
- Keeps the Supabase service-role key inside the Edge Function, never in Apps Script or the frontend.

## Prerequisites

- The `invoice_reminder_log` SQL migration has already been run in Supabase.
- Access to the Supabase project and Supabase CLI (or another supported method to deploy Edge Functions).
- A Google account that can send mail using Apps Script. Consumer accounts have a limited daily email-recipient quota; quotas are subject to change.

## 1. Add/deploy the Edge Function

Copy `supabase/functions/gmail-invoice-reminders/index.ts` into the matching path in your LedgerFlow repository.

In Supabase Edge Functions Secrets, add `INVOICE_REMINDER_CRON_SECRET`. Use a long random secret (32+ characters), generated privately. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the deployed function; do not copy the service-role key into client-side code or Apps Script.

From the project root:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy gmail-invoice-reminders --no-verify-jwt
```

Replace `YOUR_PROJECT_REF` with the reference in your Supabase project URL. The function rejects calls without the matching `x-cron-secret` header. If you already linked the right project, `supabase link` may be unnecessary.

The deployed function URL is:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/gmail-invoice-reminders`

## 2. Create the Google Apps Script

1. Open https://script.google.com and create a new standalone project.
2. Copy all contents of `google-apps-script/Code.gs` into `Code.gs`.
3. Open Project Settings and set the time zone to `Asia/Kolkata`.
4. Under Script Properties, add:
   - `LEDGERFLOW_REMINDER_FUNCTION_URL` = the function URL above
   - `LEDGERFLOW_REMINDER_CRON_SECRET` = the exact same secret as the Supabase Edge Function secret
5. Save. Do not publish/share this Apps Script project with people who should not be allowed to trigger customer emails.

## 3. Test without sending

Choose `previewInvoiceReminders` in the function selector and click Run. Approve Google authorization. Open the execution log; it should show candidate count and invoice numbers but send no email.

Before sending any real reminders, ensure the only candidates are test invoices and the client email addresses belong to people who have agreed to receive a test message.

## 4. Send one controlled test

For initial testing, use a test invoice whose due date is in the next 1–3 days and a client email you control. Run `runInvoiceReminders` manually. Confirm the message arrived and a row was added to `invoice_reminder_log`.

The reminder log records a successful `MailApp.sendEmail` call, then validates and stores the reminder. If the email sends but the log request fails, check the execution log before rerunning; that rare gap could allow a duplicate on the next run.

## 5. Enable daily automation

After the controlled test succeeds, choose `installDailyReminderTrigger` and Run once. This replaces any existing trigger for `runInvoiceReminders` and installs a daily time-driven trigger around 9 AM in the project's `Asia/Kolkata` time zone. Verify it under Apps Script Triggers and Executions.

## Reminder behavior and safety

- Due-soon window: 1–3 calendar days before due date; deduplicated by invoice and due date.
- Overdue: first eligible run after due date; then at most once every seven days while still outstanding.
- Day calculations use India Standard Time for the server's date.
- Use only with legitimate invoices and correct recipient addresses. Review candidates first. Apps Script/Gmail sending quotas are limited and can change.
- This does not make reminders part of the LedgerFlow browser app itself; the script runs independently on Google's schedule while the browser is closed.
