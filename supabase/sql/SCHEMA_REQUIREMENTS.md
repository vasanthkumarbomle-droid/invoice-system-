# Supabase schema prerequisites and verification

## Existing projects

LedgerFlow's original core database schema was created outside this repository. The SQL files numbered `001` through `005` are **additive feature migrations** and are not a substitute for the original core schema. Do not run this project's app against a fresh Supabase database until the core tables, totals/numbering triggers, grants, and organization-scoped RLS policies have been installed and verified.

The current app and migrations expect these core tables:

- `organizations`
- `org_members`
- `clients`
- `products`
- `invoices`
- `invoice_items`
- `payments`
- `quotations`
- `quotation_items`

The feature migrations additionally use:

- `document_share_tokens` and `document_signatures` (created by `003_client_document_workflow.sql`)
- `invoice_reminder_log` (created by `001_invoice_reminder_log.sql`)
- `organization_reminder_settings` (created by `002_organization_reminder_settings.sql`)

## Apply migrations in order

For an existing project where migrations 001–003 were already applied successfully, apply `004_quotation_conversion_and_account_holder.sql` and then `005_payment_integrity.sql`. Do not rerun migrations that already succeeded.

1. Open Supabase Dashboard → SQL Editor.
2. Open `VERIFY_CORE_SCHEMA.sql` and run it. In its first result, check that each required column is available. In the second result, inspect RLS and policy counts; a nonzero count alone does not prove the policies are safe.
3. Review the actual policies for all organization-scoped tables and confirm a signed-in user can only access rows for organizations where that user is a member. Check insert, update, delete and select separately; also check membership role authorization if some actions should be owner/admin only.
4. Apply `004_quotation_conversion_and_account_holder.sql`. It adds the persisted bank account holder column and the server-side quotation conversion RPC. Conversion is restricted to accepted quotations and owner/admin organization members.\n5. Apply `005_payment_integrity.sql`. Its database trigger rejects payment inserts for draft, cancelled or paid invoices, rejects overpayments, and checks the authenticated user's organization membership.\n6. Test against a disposable quotation and invoice before using real business documents.
5. Test against a disposable quotation and invoice before using real business documents.

## Database behavior that must exist

The UI and document RPCs rely on the database to:
- calculate line taxable values after discounts and calculate CGST/SGST/IGST, tax totals, invoice/quotation grand totals and balances;
- allocate unique invoice and quotation numbers;
- recalculate invoice amounts and status when a payment is inserted;
- apply organization-scoped RLS to all client-callable tables and RPCs;
- enforce that clients/products/line items and their documents belong to the same organization.

Migration 003 transactionally saves document headers and items, but the repository does **not** contain the full core schema or all existing trigger definitions. The verifier reports table/column presence and RLS state, but it cannot prove that tax triggers or policy predicates are correct. Inspect the actual trigger definitions and policies in the Supabase Dashboard before treating those requirements as satisfied.

## Important security notes

- Never expose the Supabase service-role key in the Vite frontend.
- Client document links should use random, expiring tokens; clients should not receive direct table access.
- The `quotation-workflow` Edge Function must validate owner actions using the user's session and organization membership.
- RLS enabled with zero policies usually denies browser access; RLS disabled or over-broad policies may expose cross-organization data. Do not disable RLS merely to make an error disappear.
- The bank account holder column is added by migration 004. If the core `organizations` table is missing, stop and install/restore the core schema first rather than trying the feature migrations on an empty database.
