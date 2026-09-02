-- 20260825113000 and 20260825120000 enforce the publication requirements on
-- every write to a live widget, not just on publishing one. 20260825120000 also
-- added widgets.privacy_url as nullable with no backfill, so every widget that
-- was already live got a null privacy_url and instantly failed the check.
--
-- The result is that a pre-existing live widget cannot be edited at all unless
-- the same statement happens to supply a privacy URL, a disclaimer, approved
-- domains, and a published snapshot together. Anything less is rejected --
-- including the very edit that would add the missing privacy URL. Serving is
-- unaffected, since triggers only fire on writes, but the admin app cannot
-- correct the rows the requirement was introduced to protect.
--
-- Publishing is arriving at live: an insert, or a status change into it. That
-- still requires full compliance, so nothing can be published without a privacy
-- notice. Editing a widget that is already live now only re-checks the fields
-- the statement actually changes, so a grandfathered row can be corrected and a
-- compliant one cannot be quietly degraded -- clearing privacy_url on a live
-- widget is still rejected, because that changes the field.

CREATE OR REPLACE FUNCTION provider_matcher_private.enforce_widget_publication_requirements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_domains text[];
  v_publishing boolean;
  v_check_disclaimer boolean;
  v_check_privacy boolean;
  v_check_snapshot boolean;
BEGIN
  IF NEW.status <> 'live' THEN
    RETURN NEW;
  END IF;

  -- OLD is unassigned on INSERT and reading it there raises, so the two cases
  -- are separated rather than relying on OR short-circuiting, which PL/pgSQL
  -- does not guarantee.
  IF TG_OP = 'INSERT' THEN
    v_publishing := true;
    v_check_disclaimer := true;
    v_check_privacy := true;
    v_check_snapshot := true;
  ELSE
    v_publishing := OLD.status IS DISTINCT FROM 'live';
    v_check_disclaimer := v_publishing OR NEW.disclaimer_text IS DISTINCT FROM OLD.disclaimer_text;
    v_check_privacy := v_publishing OR NEW.privacy_url IS DISTINCT FROM OLD.privacy_url;
    v_check_snapshot := v_publishing OR NEW.published_snapshot IS DISTINCT FROM OLD.published_snapshot;
  END IF;

  IF v_publishing THEN
    SELECT o.allowed_domains INTO v_domains
    FROM public.organizations o WHERE o.id = NEW.org_id;

    IF NOT provider_matcher_private.allowed_domain_list_is_safe(v_domains) THEN
      RAISE EXCEPTION 'Live widgets require 1-50 valid fully-qualified approved domains';
    END IF;
  END IF;

  IF v_check_disclaimer AND nullif(btrim(NEW.disclaimer_text), '') IS NULL THEN
    RAISE EXCEPTION 'Live widgets require a privacy disclaimer';
  END IF;

  IF v_check_privacy
    AND (NEW.privacy_url IS NULL OR NEW.privacy_url !~* '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'Live widgets require an HTTPS privacy notice URL';
  END IF;

  IF v_check_snapshot
    AND (NEW.published_snapshot IS NULL OR jsonb_typeof(NEW.published_snapshot) <> 'object') THEN
    RAISE EXCEPTION 'Live widgets require a valid published snapshot';
  END IF;

  RETURN NEW;
END;
$$;

-- ROLLBACK: restore the function body from 20260825120000, accepting that live
-- widgets created before that migration can no longer be edited.
