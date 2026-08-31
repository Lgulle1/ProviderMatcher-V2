-- A patient-facing privacy notice is a publication requirement, not optional
-- display copy. The public Edge function also fails closed for legacy rows
-- until an approved HTTPS notice is configured.

ALTER TABLE public.widgets
  ADD COLUMN IF NOT EXISTS privacy_url text;

ALTER TABLE public.widgets
  ADD CONSTRAINT widgets_privacy_url_https
  CHECK (privacy_url IS NULL OR privacy_url ~* '^https://[^[:space:]]+$')
  NOT VALID;

CREATE OR REPLACE FUNCTION provider_matcher_private.enforce_widget_publication_requirements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_domains text[];
BEGIN
  IF NEW.status <> 'live' THEN
    RETURN NEW;
  END IF;

  SELECT o.allowed_domains INTO v_domains
  FROM public.organizations o WHERE o.id = NEW.org_id;

  IF NOT provider_matcher_private.allowed_domain_list_is_safe(v_domains) THEN
    RAISE EXCEPTION 'Live widgets require 1-50 valid fully-qualified approved domains';
  END IF;
  IF nullif(btrim(NEW.disclaimer_text), '') IS NULL THEN
    RAISE EXCEPTION 'Live widgets require a privacy disclaimer';
  END IF;
  IF NEW.privacy_url IS NULL OR NEW.privacy_url !~* '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Live widgets require an HTTPS privacy notice URL';
  END IF;
  IF NEW.published_snapshot IS NULL OR jsonb_typeof(NEW.published_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Live widgets require a valid published snapshot';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION provider_matcher_private.enforce_widget_publication_requirements() FROM PUBLIC, anon, authenticated;

-- ROLLBACK: remove the privacy_url check from the publication function, then
-- DROP CONSTRAINT widgets_privacy_url_https and DROP COLUMN privacy_url.
