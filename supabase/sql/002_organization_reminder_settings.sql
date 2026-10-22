CREATE TABLE IF NOT EXISTS public.organization_reminder_settings (
    org_id uuid PRIMARY KEY
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    shared_sender_acknowledged boolean NOT NULL DEFAULT false,
    enabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    enabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reminder_sender_consent_required
        CHECK (NOT enabled OR shared_sender_acknowledged)
);

INSERT INTO public.organization_reminder_settings (org_id)
SELECT id FROM public.organizations
ON CONFLICT (org_id) DO NOTHING;

ALTER TABLE public.organization_reminder_settings
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.organization_reminder_settings
    FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.organization_reminder_settings TO service_role;

CREATE OR REPLACE FUNCTION public.initialize_org_reminder_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.organization_reminder_settings (org_id)
    VALUES (NEW.id)
    ON CONFLICT (org_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS initialize_org_reminder_settings_trigger
    ON public.organizations;

CREATE TRIGGER initialize_org_reminder_settings_trigger
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.initialize_org_reminder_settings();
