# LedgerFlow production-readiness audit

**Scope:** repository code and configuration on main, reviewed on 23 October 2026. This is a repository audit, not a live Supabase or Google Workspace penetration test.

## Executive summary

- **Repository CI:** the latest completed workflow for the application-code changes passed regression tests, ESLint, the Vite production build, and type-checks for both Supabase Edge Functions. A fresh CI run is triggered by the most recent deployment-header/reminder changes; check Actions for its final result.
- **Important database guard added:** migration 009_document_save_tenant_integrity.sql adds explicit tenant-membership, client/product-ownership and financial-item validation to invoice/quotation saving, checks products during quotation conversion, and removes browser-role execution of the internal invoice_refresh(uuid) helper.
- **Password recovery:** a reset-email flow and reset-completion route have been added. Supabase Redirect URLs still need configuring and the live email flow still needs to be tested.
- **Not yet production-certified:** GitHub code does not prove the actual Supabase RLS policies, schema, deployed functions/secrets, mail delivery, or a deployed frontend are correct. Apply migrations only after checking the live schema and migration history.

## Missing features or documented limitations

These are scope gaps, not proof of a broken existing feature:

1. **In-app reminder consent/settings screen is absent.** The server defaults each organisation's reminders to disabled; the documented setup enables them from Supabase after the owner explicitly agrees to the shared sender.
2. **Per-organisation sender identities are not implemented.** The optional reminder/document email system sends through the Google account authorising the shared Apps Script. Gmail and Apps Script quotas apply.
3. **Document emails contain secure links, not PDF attachments.** Clients can view the document and print/save an A4 PDF from the browser.
4. **There is no clean-install core database schema in this repository.** SQL files 001–009 are feature migrations, not a complete schema installer. The original core tables, calculation/numbering triggers and RLS policies must exist already.
5. **Legal terms remain a draft template.** The Terms page itself says it requires review; it should not be represented as legal advice or a lawyer-approved agreement.

## Bugs corrected on main

- **Dashboard quotation metric:** draft quotations were counted as quotations awaiting a client response. The pending total now counts only sent quotations.
- **Date and financial-year reporting:** added date-only overdue calculation and corrected the dashboard financial-year label to use the Indian April–March financial year. Dashboard and report date anchors use the India calendar date.
- **Reminder client relation shape:** the invoice reminder Edge Function now handles the related client as either an object or an array in both the candidate and send-log paths, instead of accidentally skipping clients when a relationship is returned as an array.
- **Payment duplicate-submit protection:** the payment modal now locks the submit path and disables the submit button while the save request is in flight, reducing accidental duplicate partial-payment records from repeated clicks.
- **Resend link reliability:** a previously delivered client-document link is no longer expired before the replacement email provider accepts the resend; cleanup excludes the newly issued token.
- **CSV export safety:** the existing CSV cell escape helper is covered by tests for spreadsheet formula-leading values and quotes.
- **Document tenant/data integrity:** new migration 009 checks authenticated organisation membership, verifies that the chosen client and each selected product belong to the same organisation, validates quantity/price/discount/GST inputs, checks product ownership when converting an accepted quotation, and restricts direct browser execution of the internal invoice refresh helper.
- **Authentication recovery:** added forgot-password request UI, a reset-completion page and route. The redirect URL must be added to Supabase Auth configuration before live use.
- **Hosting headers:** Vercel configuration now adds baseline content-type, referrer, frame and browser-permission headers while retaining SPA rewrites.

## Security risks still requiring live verification

### High priority: database isolation and financial integrity

- Verify that every core business table has RLS enabled and policy predicates scope SELECT, INSERT, UPDATE and DELETE to the user's organisation. Merely having one policy is not proof it is correct.
- Verify that invoice and quotation calculation triggers correctly calculate discounts, CGST/SGST/IGST, totals, numbers, and payment balances. The core definitions are not all present in this repo.
- Migration 008 protects payment updates and refreshes both invoice balances when a payment is moved. It is not active in Supabase unless applied there. Migration 009 depends on the existing core schema and payment helper being present, so inspect the database first.
- The SQL regression test checks the intended migration source text; it does not execute the SQL against PostgreSQL. Run the migration and disposable-record tests in the intended Supabase project before real billing.

### Email/token paths

- Client document links use a random 32-byte token, store only a SHA-256 token hash, and check expiry. Public client viewing/responding is intentional; do not grant public access to business tables to make it work.
- Public Edge Function routes should be monitored for abusive traffic; rate limiting has not been proven by this repository audit.
- Supabase function secrets, the Apps Script web-app secret and reminder cron secret must stay in their server-side secret stores. Never use a service-role key in VITE_* frontend variables.
- Password recovery depends on correct Supabase Site URL/Redirect URL configuration and the deployed frontend route.

## Deployment checklist

### 1. Supabase schema and migrations

- [ ] Confirm you are connected to the correct existing project and create/verify a backup before database changes.
- [ ] Run supabase/sql/VERIFY_CORE_SCHEMA.sql and review every missing column/table.
- [ ] Run the read-only supabase/sql/007_read_only_schema_audit.sql; inspect full RLS predicates, grants, triggers and function definitions, not just the policy count.
- [ ] Confirm the migration history before applying anything. Do not rerun migrations that already succeeded.
- [ ] Review and apply required migrations in dependency order: 004, 005, 006, 008, then 009 as appropriate for the live project. Apply 001–003 if missing, after reviewing their prerequisites. Migration 009 assumes the core tables and invoice_refresh(uuid) function are present.
- [ ] With disposable test data, verify creating/editing/reloading an invoice and quotation; GST/discount calculation; accepted quotation conversion; payment creation, correction, movement and deletion; and that both affected invoice balances update.
- [ ] Test that a user in organisation A cannot reference organisation B's client/product/document through either UI or direct RPC calls.

### 2. Frontend hosting (Vercel)

- [ ] Deploy the GitHub main branch to Vercel and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or the supported anon-key name) in the correct deployment environment.
- [ ] Confirm no service-role key or mail/cron secrets are present in frontend variables or repository files.
- [ ] Confirm /, /invoices, /quotations, /client-document, /terms and /reset-password load, and direct URL refreshes work.
- [ ] Add the actual deployed origin and /reset-password path to Supabase Auth Redirect URLs; configure the actual Site URL.
- [ ] Verify the deployed site is HTTPS, and review the new response headers in the browser's network panel.
- [ ] Run a mobile viewport smoke test and check invoice/quotation A4 print/PDF output. The GitHub CI build does not perform real browser/PDF testing.

### 3. Document email workflow

- [ ] Deploy quotation-workflow from the current repo using the Supabase CLI.
- [ ] Set GOOGLE_APPS_SCRIPT_URL, GOOGLE_APPS_SCRIPT_SECRET, and the real deployed PUBLIC_APP_URL as Supabase function secrets.
- [ ] Add the repository's email bridge to the existing Apps Script without deleting the reminder functions or trigger; set LEDGERFLOW_WEBHOOK_SECRET, deploy a new Apps Script Web App version, and confirm the URL ends in /exec.
- [ ] Send one test invoice and one test quotation to an address you control. Open the client link signed out; confirm expiry, response status, duplicate-response refusal and owner notification behavior.

### 4. Invoice reminders

- [ ] Apply 001 and 002 if missing, then 006 before deploying the current reminder Edge Function.
- [ ] Confirm all organisations start disabled; enable reminders only after consent to the shared sender is recorded.
- [ ] Deploy gmail-invoice-reminders with --no-verify-jwt as documented; configure INVOICE_REMINDER_CRON_SECRET in Supabase and the matching LEDGERFLOW_REMINDER_FUNCTION_URL / LEDGERFLOW_REMINDER_CRON_SECRET in Apps Script.
- [ ] Run previewInvoiceReminders first; verify each recipient and invoice. Send a controlled test to an address you own before installing the daily trigger.
- [ ] Confirm the Apps Script project timezone is Asia/Kolkata, the daily trigger is enabled, and delivery plus log deduplication works after a retry.

## Verification performed from GitHub

The passing CI run checked npm ci, npm test, npm run lint, npm run build, and deno check for both Edge Functions. The SQL migration is covered by source-level regression tests, not a real database migration test. This audit did not sign into Supabase or Google Apps Script and did not deploy the website or Edge Functions.
