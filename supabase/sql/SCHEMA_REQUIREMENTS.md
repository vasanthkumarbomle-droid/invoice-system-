# Supabase schema prerequisites and verification

## Existing projects

LedgerFlow's original core database schema was created outside this repository. The SQL files numbered `001` through `006` are **additive feature migrations**; they are not a replacement for the original schema. Do not run the application against a fresh Supabase database until the core tables, totals/numbering triggers, grants, and organization-scoped RLS policies have been installed and verified.

The app expects these core tables:

- `organizations`
- `org_members`
- `clients`
- `products`
- `invoices`
- `invoice_items`
- `payments`
- `quotations`
- `quotation_items`

Feature tables include `document_share_tokens` and `document_signatures` (migration 003), `invoice_reminder_log` (migration 001), and `organization_reminder_settings` (migration 002).

## Safe setup sequence

For the existing project where migrations 001–003 have already succeeded, apply **004 and then 005**. Do not rerun migrations that have already succeeded.

1. Open Supabase Dashboard → SQL Editor.
2. Run `VERIFY_CORE_SCHEMA.sql`. Its first result checks expected columns; the second shows whether RLS is enabled and how many policies exist.
3. Review actual RLS policy definitions for every organization-scoped table. Verify select, insert, update, and delete policies restrict rows to organizations where the signed-in user is a member. A nonzero policy count does not prove the predicates are correct.
4. Apply `004_quotation_conversion_and_account_holder.sql`. It adds the separate bank account-holder field and the server-side quotation-to-invoice conversion function. Conversion is restricted to accepted quotations and owner/admin members.
5. Apply `005_payment_integrity.sql`. The database trigger rejects payments on draft/cancelled/paid invoices, cross-organization payment rows, and payment amounts exceeding the current invoice balance.
6. Test with disposable records before issuing real documents.

## Database behavior that must exist

The application depends on database behavior for:
- calculating line taxable amounts after discounts and computing CGST/SGST/IGST, tax totals, grand totals, and outstanding balances;
- allocating unique invoice and quotation numbers;
- updating invoice balances and payment status when payments are inserted;
- enforcing organization-scoped row-level security on all client-accessible tables and RPCs;
- ensuring referenced clients, products, and document items belong to the same organization.

Migration 003 makes the document header and item writes transactional, but the repository does **not** include the complete original core schema or every existing numbering/tax trigger. The verification script checks table/column presence and RLS state; it cannot prove trigger calculations or policy predicates are correct. Inspect actual triggers and policies in the Supabase Dashboard before treating those controls as verified.

## Security notes

- Never expose the Supabase service-role key in Vite/frontend configuration.
- Client document links use random expiring tokens; clients should not receive direct table access.
- Owner actions in the `quotation-workflow` Edge Function must validate the signed-in session and organization membership.
- RLS enabled with zero policies usually denies browser access. RLS disabled or overly broad policies may expose cross-organization data. Do not disable RLS to silence an error.
- Migration 004 adds `organizations.bank_account_holder`. If the core `organizations` table is missing, stop and install/restore the real core schema instead of running feature migrations on an empty database.
