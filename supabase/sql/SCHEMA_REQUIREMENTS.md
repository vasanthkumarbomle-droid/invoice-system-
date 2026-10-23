# Supabase schema prerequisites and verification

## Existing projects

LedgerFlow's original core database schema was created outside this repository. The SQL files numbered `001` through `009` are **additive feature migrations**; they are not a replacement for the original schema. Do not run the application against a fresh Supabase database until the core tables, totals/numbering triggers, grants, and organization-scoped RLS policies have been installed and verified.

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

For an existing project, check which migrations have already succeeded. Apply **004, then 005, then 006, then 008, then 009** where appropriate. Migration 007 is a read-only audit. Do not rerun migrations that have already succeeded.

1. Open Supabase Dashboard → SQL Editor.
2. Run `VERIFY_CORE_SCHEMA.sql`. Its first result checks expected columns; the second shows whether RLS is enabled and how many policies exist.
3. Review actual RLS policy definitions for every organization-scoped table. Verify select, insert, update, and delete policies restrict rows to organizations where the signed-in user is a member. A nonzero policy count does not prove the predicates are correct.
4. Apply `004_quotation_conversion_and_account_holder.sql`. It adds the separate bank account-holder field and the server-side quotation-to-invoice conversion function. Conversion is restricted to accepted quotations and owner/admin members.
5. Apply `005_payment_integrity.sql`. The database trigger rejects payments on draft/cancelled/paid invoices, cross-organization payment rows, and payment amounts exceeding the current invoice balance.
6. Apply `006_due_date_reminders.sql` before deploying the current invoice-reminder Edge Function. It adds a separate `due_today` log type so a prior due-soon reminder does not suppress the due-date reminder.
7. Apply `008_payment_update_integrity.sql` only after reviewing the live payment schema. It validates payment updates, recalculates both invoices when a payment is moved, and clamps stored invoice balance due at zero. Test payment insert, amount correction, move, and delete with disposable records before issuing real documents.
8. Apply `009_document_save_tenant_integrity.sql`. It explicitly requires organization membership and same-organization client/product references in the invoice/quotation save functions and quotation conversion; allowlists invoice/quotation workflow statuses in the save RPCs; permits edits only for draft invoices and open quotations; adds a locked, payment-aware invoice cancellation RPC; and revokes direct browser execution of the internal `invoice_refresh(uuid)` helper. This assumes the named core tables and columns already exist.
9. Test document saves, quotation conversion, and payment create/correct/move/delete with disposable records before issuing real documents.

10. Apply `010_api_privilege_hardening.sql` to remove anonymous table/sequence access, reduce authenticated structural privileges, reserve internal tables for server-side workflows, revoke direct execution of trigger/event-trigger helpers, and restrict default function execution grants.
11. Apply `011_authenticated_rls_and_maintain.sql` to change existing organization/billing policies from `PUBLIC` to `authenticated` and remove PostgreSQL `MAINTAIN` from authenticated users. Public document sharing and reminder workflows should go through their server-side Edge Functions.

After migrations 010 and 011, verify anonymous table access is absent, every exposed data table has RLS enabled, private business policies target authenticated users, internal helper functions cannot be called as RPCs, and the application's authenticated save/payment/quotation flows still work. Some remaining Supabase advisor findings (for example foreign-key indexes, `pg_trgm` placement, password-breach protection, and helper RPC warnings) require individual review rather than blanket suppression.

## Database behavior that must exist

The application depends on database behavior for:
- calculating line taxable amounts after discounts and computing CGST/SGST/IGST, tax totals, grand totals, and outstanding balances;
- allocating unique invoice and quotation numbers;
- updating invoice balances and payment status when payments are inserted;
- enforcing organization-scoped row-level security on all client-accessible tables and RPCs;
- ensuring referenced clients, products, and document items belong to the same organization (migration 009 adds explicit checks to both document-save RPCs).

Migration 003 makes the document header and item writes transactional, but the repository does **not** include the complete original core schema or every existing numbering/tax trigger. The verification script checks table/column presence and RLS state; it cannot prove trigger calculations or policy predicates are correct. Inspect actual triggers and policies in the Supabase Dashboard before treating those controls as verified.

## Security notes

- Never expose the Supabase service-role key in Vite/frontend configuration.
- Client document links use random expiring tokens; clients should not receive direct table access.
- Owner actions in the `quotation-workflow` Edge Function must validate the signed-in session and organization membership.
- RLS enabled with zero policies usually denies browser access. RLS disabled or overly broad policies may expose cross-organization data. Do not disable RLS to silence an error.
- Migration 004 adds `organizations.bank_account_holder`. If the core `organizations` table is missing, stop and install/restore the real core schema instead of running feature migrations on an empty database.
