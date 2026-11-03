# Supabase database setup and safety notes

LedgerFlow uses Supabase for authentication, business data, database functions and Edge Functions. Review the target project and its migration history before running SQL.

## SQL files

### Baseline schema

`000_core_schema.sql` is a schema-only snapshot generated from the connected LedgerFlow database on 25 October 2026. It contains no business row data and is intended as a starting point for a **new, empty database**.

- Do not run this snapshot against an existing production database.
- Review extensions, grants, policies, functions and environment-specific assumptions before using it.
- Test the setup in a disposable Supabase project and verify the resulting schema and application workflows before relying on it.

### Incremental SQL

The remaining files contain feature changes, security hardening, fixes and verification scripts. Some filenames share numeric prefixes (including 010, 012, 013 and 014), so the filename alone is not a reliable unique migration sequence.

For an existing project:

1. Confirm that you are connected to the intended Supabase project.
2. Take or verify a restorable backup.
3. Review the project's migration history and current schema.
4. Inspect the SQL file and its prerequisites before applying it.
5. Apply only changes that are not already present, one script at a time.
6. Record what was applied and test the affected workflows with disposable data.

Do not execute every SQL file in bulk or rerun a script just because it is present in the repository.

## Verification

- Use `VERIFY_CORE_SCHEMA.sql` to inspect expected tables and columns and the current RLS state.
- Use `007_read_only_schema_audit.sql` for the read-only schema and policy diagnostic.
- Inspect the actual policy predicates, grants, triggers and function definitions. A table having RLS enabled or a nonzero policy count does not prove that access is correctly restricted.

## Required database behavior

The application relies on database-side controls for:

- Organization-scoped access to business records.
- Invoice and quotation numbering.
- Line-item discounts, GST calculations, totals and outstanding balances.
- Payment validation and invoice status updates.
- Atomic invoice and quotation saves.
- Validation that referenced clients and products belong to the same organization.

Confirm these behaviors against the actual database. Source files and SQL scripts in GitHub do not prove that a migration has been applied to the live project.

## Edge Functions and integrations

The repository contains Edge Functions for the client document workflow and invoice reminders. Their deployment and secret configuration are separate from the frontend deployment.

Keep these values in Supabase's server-side secret store:

- Apps Script Web App URL and shared secret.
- Public frontend origin used to build client document links.
- Invoice reminder cron secret.

Never put a service-role key, Apps Script shared secret or cron secret in frontend variables or commit them to GitHub.

## Before using real business data

- Test organization isolation with separate test users/organizations.
- Test invoice and quotation create, edit, conversion and reload flows.
- Test valid and invalid payment amounts, partial payments and payment corrections.
- Verify GST totals and document output with known test cases.
- Test client links, expiry and email delivery using addresses you control.
- Confirm that backups can be restored.

These checks must be performed in the intended Supabase and Google accounts; a successful frontend build does not replace them.
