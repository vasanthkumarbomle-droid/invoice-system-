-- Migration 003: transactional document saves and secure client document links.
-- Apply this file in the Supabase SQL Editor before using the new workflows.
-- The save functions are SECURITY INVOKER so caller permissions and RLS policies apply.

CREATE TABLE IF NOT EXISTS public.document_share_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    document_type text NOT NULL CHECK (document_type IN ('invoice', 'quotation')),
    document_id uuid NOT NULL,
    token_hash text NOT NULL UNIQUE,
    recipient_email text NOT NULL,
    expires_at timestamptz NOT NULL,
    response_status text CHECK (response_status IN ('accepted', 'rejected')),
    responded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_share_tokens_document_idx
    ON public.document_share_tokens (org_id, document_type, document_id, created_at DESC);

ALTER TABLE public.document_share_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_share_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.document_share_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.save_invoice_with_items(
    p_org_id uuid,
    p_document_id uuid,
    p_invoice jsonb,
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_id uuid := p_document_id;
    v_item jsonb;
    v_position integer := 0;
BEGIN
    IF v_id IS NULL THEN
        INSERT INTO public.invoices (
            org_id, client_id, issue_date, due_date, status, notes
        )
        VALUES (
            p_org_id,
            NULLIF(p_invoice->>'client_id', '')::uuid,
            COALESCE(NULLIF(p_invoice->>'issue_date', '')::date, CURRENT_DATE),
            NULLIF(p_invoice->>'due_date', '')::date,
            COALESCE(NULLIF(p_invoice->>'status', ''), 'draft'),
            NULLIF(p_invoice->>'notes', '')
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.invoices
        SET client_id = NULLIF(p_invoice->>'client_id', '')::uuid,
            issue_date = COALESCE(NULLIF(p_invoice->>'issue_date', '')::date, issue_date),
            due_date = NULLIF(p_invoice->>'due_date', '')::date,
            status = COALESCE(NULLIF(p_invoice->>'status', ''), status),
            notes = NULLIF(p_invoice->>'notes', '')
        WHERE id = v_id AND org_id = p_org_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice not found in this organization.';
        END IF;

        DELETE FROM public.invoice_items
        WHERE invoice_id = v_id AND org_id = p_org_id;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        INSERT INTO public.invoice_items (
            org_id, invoice_id, position, product_id, description,
            hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate
        )
        VALUES (
            p_org_id, v_id, v_position,
            NULLIF(v_item->>'product_id', '')::uuid,
            COALESCE(v_item->>'description', ''),
            NULLIF(v_item->>'hsn_sac', ''),
            COALESCE(NULLIF(v_item->>'unit', ''), 'unit'),
            COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1),
            COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0),
            COALESCE(NULLIF(v_item->>'discount_pct', '')::numeric, 0),
            COALESCE(NULLIF(v_item->>'gst_rate', '')::numeric, 0)
        );
        v_position := v_position + 1;
    END LOOP;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_quotation_with_items(
    p_org_id uuid,
    p_document_id uuid,
    p_quotation jsonb,
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_id uuid := p_document_id;
    v_item jsonb;
    v_position integer := 0;
BEGIN
    IF v_id IS NULL THEN
        INSERT INTO public.quotations (
            org_id, client_id, issue_date, valid_until, status, notes, terms
        )
        VALUES (
            p_org_id,
            NULLIF(p_quotation->>'client_id', '')::uuid,
            COALESCE(NULLIF(p_quotation->>'issue_date', '')::date, CURRENT_DATE),
            NULLIF(p_quotation->>'valid_until', '')::date,
            COALESCE(NULLIF(p_quotation->>'status', ''), 'draft'),
            NULLIF(p_quotation->>'notes', ''),
            NULLIF(p_quotation->>'terms', '')
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.quotations
        SET client_id = NULLIF(p_quotation->>'client_id', '')::uuid,
            issue_date = COALESCE(NULLIF(p_quotation->>'issue_date', '')::date, issue_date),
            valid_until = NULLIF(p_quotation->>'valid_until', '')::date,
            status = COALESCE(NULLIF(p_quotation->>'status', ''), status),
            notes = NULLIF(p_quotation->>'notes', ''),
            terms = NULLIF(p_quotation->>'terms', '')
        WHERE id = v_id AND org_id = p_org_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Quotation not found in this organization.';
        END IF;

        DELETE FROM public.quotation_items
        WHERE quotation_id = v_id AND org_id = p_org_id;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        INSERT INTO public.quotation_items (
            org_id, quotation_id, position, product_id, description,
            hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate
        )
        VALUES (
            p_org_id, v_id, v_position,
            NULLIF(v_item->>'product_id', '')::uuid,
            COALESCE(v_item->>'description', ''),
            NULLIF(v_item->>'hsn_sac', ''),
            COALESCE(NULLIF(v_item->>'unit', ''), 'unit'),
            COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1),
            COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0),
            COALESCE(NULLIF(v_item->>'discount_pct', '')::numeric, 0),
            COALESCE(NULLIF(v_item->>'gst_rate', '')::numeric, 0)
        );
        v_position := v_position + 1;
    END LOOP;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_invoice_with_items(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_quotation_with_items(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_with_items(uuid, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_quotation_with_items(uuid, uuid, jsonb, jsonb) TO authenticated;


-- Optional owner-drawn signature image used in the local print preview and secure client view.
-- Only the service role may read or write these rows; the Edge Function checks organization membership.
CREATE TABLE IF NOT EXISTS public.document_signatures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    document_type text NOT NULL CHECK (document_type IN ('invoice', 'quotation')),
    document_id uuid NOT NULL,
    signature_data text NOT NULL CHECK (
        signature_data LIKE 'data:image/png;base64,%'
        AND length(signature_data) <= 1000000
    ),
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT document_signatures_one_per_document
      UNIQUE (org_id, document_type, document_id)
);

CREATE INDEX IF NOT EXISTS document_signatures_lookup_idx
    ON public.document_signatures (org_id, document_type, document_id);

ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_signatures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.document_signatures TO service_role;
