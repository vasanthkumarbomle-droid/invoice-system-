-- Migration 010: reduce Data API privileges and close direct access to internal helpers.
-- This changes grants/function configuration only; it does not modify business rows.
-- Anonymous document sharing and reminders use the Edge Functions with server-side credentials.
-- They do not need direct anon table access.

-- No anonymous client needs direct access to private billing tables.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon;

-- Keep normal authenticated CRUD rights subject to RLS, but never expose structural privileges.
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM authenticated;

-- Audit is readable through its finance-role RLS policy, but writes are trigger-only.
REVOKE ALL PRIVILEGES ON TABLE public.audit_log FROM authenticated;
GRANT SELECT ON TABLE public.audit_log TO authenticated;

-- These tables are internal: numbering, reminder processing, shared-document tokens/signatures.
REVOKE ALL PRIVILEGES ON TABLE
  public.document_counters,
  public.invoice_reminder_log,
  public.organization_reminder_settings,
  public.document_share_tokens,
  public.document_signatures
FROM anon, authenticated;

-- Trigger/event-trigger functions are implementation details, not RPC endpoints.
REVOKE ALL PRIVILEGES ON FUNCTION public.add_owner_member()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.audit_trigger()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.iitem_totals()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.initialize_org_reminder_settings()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.payment_after()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.qitem_totals()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.set_updated_at()
  FROM PUBLIC, anon, authenticated;

-- These authenticated helper RPCs perform their own membership/email validation.
-- RLS policies use has_role/is_member, and document numbering needs next_doc_number.
REVOKE ALL PRIVILEGES ON FUNCTION public.accept_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.has_role(uuid, public.member_role[]) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.is_member(uuid) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.next_doc_number(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.member_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text) TO authenticated;

-- Pin SECURITY DEFINER search paths so temporary objects cannot shadow public objects.
ALTER FUNCTION public.accept_invitation(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.add_owner_member() SET search_path = public, pg_temp;
ALTER FUNCTION public.audit_trigger() SET search_path = public, pg_temp;
ALTER FUNCTION public.has_role(uuid, public.member_role[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.iitem_totals() SET search_path = public, pg_temp;
ALTER FUNCTION public.initialize_org_reminder_settings() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_member(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.next_doc_number(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.qitem_totals() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog;

-- New public-schema functions must receive explicit EXECUTE grants instead of inheriting PUBLIC access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
