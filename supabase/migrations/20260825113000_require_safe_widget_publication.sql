-- Public widgets fail closed: publishing requires a privacy disclaimer and a
-- narrow, syntactically valid domain allowlist. These checks live in the
-- database so they cannot be bypassed by calling the REST API directly.

CREATE OR REPLACE FUNCTION provider_matcher_private.allowed_domain_list_is_safe(p_domains text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_entry text;
  v_host text;
BEGIN
  IF p_domains IS NULL OR cardinality(p_domains) < 1 OR cardinality(p_domains) > 50 THEN
    RETURN false;
  END IF;

  FOREACH v_entry IN ARRAY p_domains LOOP
    v_host := lower(btrim(coalesce(v_entry, '')));
    v_host := regexp_replace(v_host, '^[a-z][a-z0-9+.-]*://', '', 'i');
    v_host := split_part(split_part(v_host, '/', 1), ':', 1);

    IF length(v_host) > 253
       OR position('.' in v_host) = 0
       OR v_host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION provider_matcher_private.allowed_domain_list_is_safe(text[]) FROM PUBLIC, anon, authenticated;

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

  SELECT o.allowed_domains
    INTO v_domains
    FROM public.organizations o
   WHERE o.id = NEW.org_id;

  IF NOT provider_matcher_private.allowed_domain_list_is_safe(v_domains) THEN
    RAISE EXCEPTION 'Live widgets require 1-50 valid fully-qualified approved domains';
  END IF;
  IF nullif(btrim(NEW.disclaimer_text), '') IS NULL THEN
    RAISE EXCEPTION 'Live widgets require a privacy disclaimer';
  END IF;
  IF NEW.published_snapshot IS NULL OR jsonb_typeof(NEW.published_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Live widgets require a valid published snapshot';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION provider_matcher_private.enforce_widget_publication_requirements() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_widget_publication_requirements ON public.widgets;
CREATE TRIGGER enforce_widget_publication_requirements
  BEFORE INSERT OR UPDATE ON public.widgets
  FOR EACH ROW EXECUTE FUNCTION provider_matcher_private.enforce_widget_publication_requirements();

CREATE OR REPLACE FUNCTION provider_matcher_private.prevent_live_widget_allowlist_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.widgets w WHERE w.org_id = NEW.id AND w.status = 'live'
  ) AND NOT provider_matcher_private.allowed_domain_list_is_safe(NEW.allowed_domains) THEN
    RAISE EXCEPTION 'Unpublish all widgets before removing or invalidating approved domains';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION provider_matcher_private.prevent_live_widget_allowlist_removal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_live_widget_allowlist_removal ON public.organizations;
CREATE TRIGGER prevent_live_widget_allowlist_removal
  BEFORE UPDATE OF allowed_domains ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION provider_matcher_private.prevent_live_widget_allowlist_removal();

-- ROLLBACK (manual):
-- DROP TRIGGER IF EXISTS prevent_live_widget_allowlist_removal ON public.organizations;
-- DROP TRIGGER IF EXISTS enforce_widget_publication_requirements ON public.widgets;
-- DROP FUNCTION IF EXISTS provider_matcher_private.prevent_live_widget_allowlist_removal();
-- DROP FUNCTION IF EXISTS provider_matcher_private.enforce_widget_publication_requirements();
-- DROP FUNCTION IF EXISTS provider_matcher_private.allowed_domain_list_is_safe(text[]);
