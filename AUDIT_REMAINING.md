# Claude audit follow-up — remaining issues

Last reviewed against GitHub `main` on 2026-10-23. This is a source-code review checklist, **not** a claim that live Supabase workflows have passed integration tests.

## Fixed in the current code (confirmed by source inspection)

- [x] CSV cells are quoted, embedded quotes are escaped, and spreadsheet formula-leading text is prefixed in `src/lib/finance.js`.
- [x] Missing invoice and quotation numbers have display fallbacks in the record mappers.
- [x] Dashboard invoice totals exclude Draft and Cancelled documents.
- [x] India-local date helper and payment-terms-based due-date calculation are used in the editor.
- [x] HSN/SAC is represented in product and document line items and included in the standalone invoice HTML.
- [x] Manual client details can be saved by creating a client record before saving a document.
- [x] Payment modal filters out Draft, Cancelled and Paid invoices; amount input allows paise-level values (minimum ₹0.01); payment notes are passed to the database.
- [x] Database list queries page through results rather than silently stopping at the first 1,000 rows.
- [x] Invoice cancellation is represented as a retained status rather than a hard-delete action in the UI.
- [x] `supabase/sql/005_payment_integrity.sql` exists and the user confirmed the trigger was present after applying it in Supabase.
- [x] Fixed in commit `036799b`: if `balance_due` is NULL, invoice mapping now falls back to `grand_total - amount_paid` instead of incorrectly treating the invoice as fully paid.

## Still open — requires code, schema or live-environment verification

### P0 — database/security/financial integrity
- [ ] **Core database schema is not a clean-install migration.** README explicitly says the app assumes pre-existing core tables, columns, calculation/numbering triggers, RPC functions and RLS policies. Add a reviewed, versioned baseline schema only after comparing it with the live Supabase project; do not guess table definitions.
- [ ] **Audit RLS policies on every table**, especially `document_share_tokens`, `document_signatures`, `invoice_reminder_log` and `organization_reminder_settings`. Confirm intended service-role-only access where appropriate and org-scoped policies elsewhere.
- [ ] **Verify the actual database definitions** of `save_invoice_with_items`, `save_quotation_with_items`, `convert_quotation_to_invoice`, totals/GST calculation, invoice numbering and payment status triggers. Their presence/behavior cannot be proven from frontend code alone.
- [ ] **End-to-end payment tests against a test invoice**: reject zero/negative, over-balance, draft/cancelled/paid invoice and cross-organization payments; accept valid partial/exact-balance payment; confirm totals/status update exactly once. Migration 005's existence is not a substitute for these tests.
- [ ] Review authorization for SECURITY DEFINER functions and client-document/signature Edge Function actions against actual RLS, org membership and deployment secrets.

### P1 — financial correctness/document output
- [ ] Verify quotation discount round-trip with a saved quote: create, reopen, edit without changes, save, reload, and compare line discount, taxable amount, GST and grand total. Test both percentage and fixed-value discounts.
- [ ] Verify invoice edit round-trip with discount and GST, including rounding and partially paid invoices.
- [ ] Confirm GST report excludes Draft/Cancelled invoices and correctly splits CGST/SGST/IGST; compare CSV columns and report totals with database values. CSV export currently needs review for explicit CGST, SGST and IGST columns.
- [ ] Review GST invoice print/PDF against applicable Indian invoice requirements (seller/buyer details, place of supply, HSN/SAC, tax split, invoice number/date and rounding). This is a product review, not legal/tax certification.
- [ ] Confirm payment updates cannot bypass integrity checks; migration 005 currently adds a BEFORE INSERT trigger, so review whether direct payment UPDATE/DELETE operations should be restricted or separately validated.

### P1 — auth, dates and reminder workflows
- [x] AuthGate now shows a recoverable organization-load error and Retry action instead of treating a failed lookup as first-time setup (source-inspected in `src/AuthGate.jsx`). Network/session recovery still needs browser testing.
- [ ] Test due dates for all supported terms and date boundaries in Asia/Kolkata, including early-morning IST and month/year rollover.
- [ ] Test due-today, due-soon and overdue reminders in a non-production environment, including opt-out, duplicate prevention, overlapping runs, failed email/logging and actual delivery.
- [ ] Check that terms/privacy/security copy reflects the real deployment and is reachable before/without login where required.

### P2 — UX, reporting and maintainability
- [ ] Check all remaining report date ranges and fiscal-year labels with fixed test dates, including Q3 Oct–Dec.
- [x] Source search found no former Apex demo identity, fake 14.2% trend, old mojibake strings, or hard-coded 2026–27 financial-year label in current `src/App.jsx`. Notification behavior still needs a browser smoke test.
- [ ] Check badge styles for every document status, barcode scan recovery after unmatched codes, product stock-zero editing, account-holder persistence and paise-level payment settlement.
- [x] Added `src/lib/finance.test.js` with unit tests for date rollover, payment terms, discount/tax math, CSV escaping/formula protection and paise wording. These tests were committed but have **not been executed in this environment**.
- [ ] Add regression tests for invoice/quotation save/edit/payment flows and database integration tests for RPCs/RLS.
- [ ] Run current CI after the latest commits and perform a browser smoke test. Prior static/source checks are not evidence that live Supabase/email workflows work.

## Validation record

- Reviewed current `main` source via GitHub connector.
- No live Supabase mutation or payment transaction was performed as part of this source review.
- CI/build status for the latest commit must be checked separately; do not infer a pass from an empty status list.
