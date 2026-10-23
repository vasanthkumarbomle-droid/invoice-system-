-- Migration 011: make private billing policies authenticated-only and remove MAINTAIN.
-- No business rows are changed. Public document links are served through Edge Functions,
-- not direct anonymous access to public-schema billing tables.

REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE MAINTAIN ON TABLES FROM authenticated;

-- These tables contain organization-scoped invoice/customer/business data.
-- Policies using the PUBLIC role are unnecessary because anonymous table access
-- has been removed and public-share workflows use the server-side Edge Function.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND array_length(roles, 1) = 1
       AND roles[1] = 'public'::name
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO authenticated',
      p.policyname,
      p.schemaname,
      p.tablename
    );
  END LOOP;
END;
$$;
