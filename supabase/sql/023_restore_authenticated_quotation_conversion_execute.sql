-- Migration 023: restore authenticated quotation-to-invoice conversion.
-- Keep the RPC unavailable to anonymous and PUBLIC roles. The function itself
-- continues to enforce signed-in owner/admin membership and tenant ownership.

REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(uuid, date)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.convert_quotation_to_invoice(uuid, date)
  TO authenticated;
