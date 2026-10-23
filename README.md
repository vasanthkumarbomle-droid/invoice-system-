# LedgerFlow — Invoice & Quotation Generation System

LedgerFlow is a React/Vite billing application backed by Supabase. It supports client and product management, invoices, quotations, payment recording, GST breakdowns, document signatures, and secure client responses to quotations.

## Requirements

- Node.js 22 or later
- npm
- A Supabase project with the LedgerFlow core tables and organization-scoped Row Level Security (RLS) policies
- Supabase CLI for deploying Edge Functions
- Google Apps Script for the optional invoice-reminder and document-email workflows

## Local development

1. Clone or download this repository and open the project root in a terminal.
2. Copy .env.example to .env.
3. Fill in your Supabase project URL and publishable (or anon) key from Supabase. These are public client configuration values; **never put the Supabase service-role key in frontend configuration**.
4. Install dependencies and start Vite by running: npm ci, then npm run dev.
5. Run production checks before publishing: npm run lint, then npm run build.

The site uses Vite's dist output. vercel.json contains the SPA rewrite needed for refreshes on routes such as /invoices and /client-document.

## Environment variables

Required for the frontend:
- VITE_SUPABASE_URL: the project's HTTPS URL.
- VITE_SUPABASE_PUBLISHABLE_KEY: the project's publishable key. VITE_SUPABASE_ANON_KEY is also supported for older projects.

Do not put SUPABASE_SERVICE_ROLE_KEY, GOOGLE_APPS_SCRIPT_SECRET, the reminder cron secret, or other server secrets in frontend variables.

## Database setup and migrations

**This repository does not currently contain a full clean-install schema for all core LedgerFlow tables.** It assumes the project already has the core tables (organizations, org_members, clients, products, invoices, invoice_items, quotations, quotation_items, and payments), expected columns, calculation/numbering triggers, and correct RLS policies. Do not run the feature migrations against an empty or unrelated Supabase project expecting them to create the whole product schema.

After reviewing the schema and backing up the project, apply the feature migrations in Supabase SQL Editor as appropriate:

- supabase/sql/001_invoice_reminder_log.sql — reminder send history.
- supabase/sql/002_organization_reminder_settings.sql — reminder opt-in settings.
- supabase/sql/003_client_document_workflow.sql — secure client links, signatures, and transactional save RPCs.
- supabase/sql/004_quotation_conversion_and_account_holder.sql — accepted quotation conversion and persisted bank account-holder name.
- supabase/sql/005_payment_integrity.sql — server-side validation that prevents payments against draft/cancelled invoices and amounts above the outstanding balance.

Migrations 003–005 were added after the base project schema was already being used. They are not proof that the live database has been migrated. Review the SQL and verify the results in the target project before using the affected workflows.

## Client document emails and quotation response

The document workflow Edge Function is in supabase/functions/quotation-workflow/index.ts. It calls Google Apps Script MailApp through the bridge in supabase/GOOGLE_APPS_SCRIPT_EMAIL_BRIDGE.gs. Configure that bridge in your existing Apps Script project without deleting reminder functions or triggers.

After deploying the Apps Script Web App and setting its shared secret, configure these Edge Function secrets in Supabase:
- GOOGLE_APPS_SCRIPT_URL: deployed Apps Script Web App URL ending in /exec.
- GOOGLE_APPS_SCRIPT_SECRET: same secret as the Apps Script LEDGERFLOW_WEBHOOK_SECRET Script Property.
- PUBLIC_APP_URL: public frontend origin, added after the frontend is deployed.

Deploy the Edge Function from the project folder with: npx supabase functions deploy quotation-workflow.

A client email contains a secure link to view a document and print/save a PDF. It does not attach a PDF file. A drawn signature image is not a cryptographic or legally verified electronic-signature service.

## Invoice reminder system

The reminder Edge Function is in supabase/functions/gmail-invoice-reminders/index.ts. Its setup and the Google Apps Script reminder runner are documented in GMAIL-REMINDERS-SETUP.md. Configure server-side cron secrets and database settings only in their respective server environments. Reminder delivery needs live end-to-end tests in the intended Supabase and Google accounts.

## Security and operational notes

- The client browser uses only the Supabase publishable/anon key. Authorization must be enforced by Supabase RLS and Edge Function membership checks.
- Verify every table has an organization-scoped policy before loading or writing business records.
- Do not commit .env, API keys, service-role keys, Apps Script shared secrets, or cron secrets.
- Database migrations and remote settings must be applied separately; updating GitHub main does not automatically update Supabase.
- GST classification and rates depend on the supplied goods/services and HSN/SAC classification. Verify the applicable rate before issuing a tax invoice.
- CI runs lint/build and Edge Function type-checks. Live database, email delivery, and browser workflows still require separate integration tests.
