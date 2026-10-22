# LedgerFlow free Gmail invoice reminders

This edition uses Google Apps Script's `MailApp` to send emails from the Google account that authorizes the script. It does not require Resend or a purchased sending domain. Gmail/Apps Script quotas apply; check the official quota page before broad use: https://developers.google.com/apps-script/guides/services/quotas

## What it does

- Sends a polite reminder for invoices due in 1–3 days (one successful reminder per invoice due date; the window allows recovery if a scheduled run was missed).
- Sends an overdue follow-up for an outstanding invoice, then at most once every 7 days.
- Skips draft, cancelled, and paid invoices, invoices without a client email, and invoices with no outstanding balance.
- Uses `public.invoice_reminder_log` to record sends and suppress repeat reminders.
- Sends email through the Google account that authorizes the Apps Script. This is a shared sender, not each organization's own Gmail account.
- Keeps the Supabase service-role key inside the Edge Function, never in Apps Script or the frontend.

## Prerequisites

- Access to the correct Supabase project and its SQL Editor.
- Both SQL scripts in `supabase/sql/` applied successfully, in order:
  1. `001_invoice_reminder_log.sql`
  2. `002_organization_reminder_settings.sql`
- Access to the Supabase project and Supabase CLI (or another supported method to deploy Edge Functions).
- A Google account that can send mail using Apps Script. Consumer accounts have a limited daily email-recipient quota; quotas are subject to change.

**Important:** The Edge Function will return an error if either SQL script is missing. Existing organizations start with reminders disabled. Do not enable reminders for an organization until its owner has explicitly agreed to use the shared sender.

## 1. Apply the SQL scripts

In the Supabase SQL Editor for the correct project, run the full contents of `supabase/sql/001_invoice_reminder_log.sql`, then `supabase/sql/002_organization_reminder_settings.sql`. Confirm both complete successfully before deploying the function.

### Enable reminders only after explicit consent

The settings migration intentionally defaults every organization to disabled. After the organization owner has reviewed and accepted the shared-sender arrangement, find the correct organization UUID and run this statement, replacing `YOUR_ORG_UUID` with that UUID:

```sql
UPDATE public.organization_reminder_settings
SET enabled = true,
    shared_sender_acknowledged = true,
    enabled_at = now(),
    updated_at = now()
WHERE org_id = 'YOUR_ORG_UUID';
```

Check that exactly the intended organization's row was updated. To disable reminders, set `enabled = false` for that same `org_id`. These settings are managed in Supabase; this repository does not currently provide a reminder-consent screen in the app.

## 2. Deploy the Edge Function

From the project root:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy gmail-invoice-reminders --no-verify-jwt
```

Replace `YOUR_PROJECT_REF` with the reference in your Supabase project URL. In Supabase Edge Function Secrets, add `INVOICE_REMINDER_CRON_SECRET` using a privately generated random secret of at least 32 characters. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the deployed function. Never put the service-role key in the frontend or Apps Script.

The function URL is:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/gmail-invoice-reminders`

The function checks the `x-cron-secret` header on each POST request. If you already linked the correct project, `supabase link` may be unnecessary.

## 3. Create the Google Apps Script

1. Open https://script.google.com and create a new standalone project.
2. Copy all contents of `google-apps-script/Code.gs` into `Code.gs`.
3. Open Project Settings and set the time zone to `Asia/Kolkata`.
4. Under Script Properties, add:
   - `LEDGERFLOW_REMINDER_FUNCTION_URL` = the function URL above
   - `LEDGERFLOW_REMINDER_CRON_SECRET` = the exact same secret as the Supabase Edge Function secret
5. Save. Do not publish/share this Apps Script project with people who should not be allowed to trigger customer emails.

## 4. Preview without sending

Choose `previewInvoiceReminders` in the function selector and click Run. Approve Google authorization. Open the execution log and verify the candidate count, invoice numbers, and recipients against the intended test data. This function does not send email.

Before sending any real reminders, ensure candidates are expected and recipients are correct. Use test invoices and email addresses you control for initial testing.

## 5. Send one controlled test

Use a test invoice due in the next 1–3 days and a client email address you control. Run `runInvoiceReminders` manually. Confirm the message arrived and a row was added to `invoice_reminder_log`.

The script logs after `MailApp.sendEmail` returns successfully. If the email sends but the logging request fails, inspect the execution log before retrying; a duplicate is possible in that failure window. Avoid running multiple reminder jobs concurrently.

## 6. Enable daily automation

Only after the controlled test succeeds, choose `installDailyReminderTrigger` and Run once. This replaces any existing trigger for `runInvoiceReminders` and installs a daily time-driven trigger around 9 AM in the project's `Asia/Kolkata` time zone. Verify it under Apps Script Triggers and Executions.

## Reminder behavior and safety

- Due-soon window: 1–3 calendar days before due date; deduplicated by invoice and due date.
- Overdue: first eligible run after due date; then at most once every seven days while still outstanding.
- Day calculations use India Standard Time for the server's date.
- Use only with legitimate invoices and correct recipient addresses. Review candidates first. Apps Script/Gmail sending quotas are limited and can change.
- This is not an in-app background process: Apps Script runs on Google's schedule while the browser is closed.
- The current design uses one shared Apps Script sender. Per-organization Gmail OAuth/sender identities are not implemented.
