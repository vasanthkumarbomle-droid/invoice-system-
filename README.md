# LedgerFlow

LedgerFlow is an invoicing and quotation management application for small businesses. It brings client and product records, GST calculations, payment tracking and customer document workflows into one workspace.

**Production:** [ledgerflowhq.vercel.app](https://ledgerflowhq.vercel.app)

## Features

- Manage clients and product inventory.
- Create and manage invoices and quotations.
- Calculate GST with CGST, SGST and IGST breakdowns.
- Record payments and track outstanding balances.
- Generate customer-ready invoice and quotation documents.
- Share secure document links for client quotation responses.
- Support invoice reminders through the optional Google Apps Script workflow.

## Technology

- React and Vite
- Supabase Database, Authentication and Edge Functions
- Tailwind CSS
- React PDF
- Recharts

## Run locally

### Requirements

- Node.js 22 or later
- npm
- A configured Supabase project

### Setup

1. Clone the repository and open its folder.
2. Copy `.env.example` to `.env`.
3. Set the Supabase project URL and publishable key in `.env`.
4. Install dependencies and start the development server:

```bash
npm ci
npm run dev
```

The app is available at the local URL printed by Vite.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key |

The app also supports `VITE_SUPABASE_ANON_KEY` for older configurations.

Never put a Supabase service-role key, Apps Script secret or reminder cron secret in a `VITE_*` variable or commit it to this repository.

## Database and backend setup

Database SQL is maintained under `supabase/sql/`. Read [the database setup and safety notes](supabase/sql/SCHEMA_REQUIREMENTS.md) before running any SQL.

- `000_core_schema.sql` is a schema-only baseline snapshot intended for a new, empty database after review and testing. **Do not run it against an existing production database.**
- The remaining SQL files are incremental changes. Check the target project's migration history and inspect each script before applying it; do not run every file blindly.
- SQL changes, Supabase Edge Function deployments and Vercel frontend deployments are separate operations. A GitHub push does not apply database changes or deploy Edge Functions.

The client document workflow is described in [CLIENT_DOCUMENT_WORKFLOW_SETUP.md](supabase/CLIENT_DOCUMENT_WORKFLOW_SETUP.md). The optional reminder workflow is described in [GMAIL-REMINDERS-SETUP.md](GMAIL-REMINDERS-SETUP.md).

## Quality checks

Run the checks before publishing:

```bash
npm test
npm run lint
npm run build
```

GitHub Actions runs these checks and type-checks the Supabase Edge Functions on pushes to `main` and pull requests.

## Security notes

- Keep Row Level Security enabled and verify organization-scoped policies for business data.
- Keep service-role and integration secrets in Supabase/Vercel server-side settings.
- Back up the database before applying SQL changes.
- Test payment, invoice, quotation and email workflows with disposable records before using them with real customers.
- GST classification and applicable rates depend on the goods/services and HSN/SAC details. Verify them before issuing a tax invoice.

## Repository layout

- `src/` — React application and shared modules
- `supabase/sql/` — database baseline, migrations and verification scripts
- `supabase/functions/` — Supabase Edge Functions
- `google-apps-script/` — Apps Script reminder integration
- `tests/` — regression tests
- `scripts/verify.ps1` — Windows PowerShell verification helper
