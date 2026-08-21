-- Backfills two functions into version control that existed live on the
-- database but were never captured by any tracked migration (predate this
-- repo's migration history, or were applied directly against prod at some
-- point outside the normal workflow).
--
-- Bodies below are copied verbatim from the live definitions (via
-- pg_get_functiondef), so this is a documentation-only no-op: it does not
-- change behavior, it just brings the repo in sync with what's already
-- running.

CREATE OR REPLACE FUNCTION public.normalize_name(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT LOWER(REGEXP_REPLACE(TRIM(input), '[^a-zA-Z0-9\s]', '', 'g'));
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Used as a BEFORE UPDATE trigger on: case_types, categories, constraints,
-- locations, offerings, organizations, provider_locations, providers,
-- questions, users, widgets. (storage.objects has its own separate,
-- Supabase-managed trigger of the same name/purpose -- not this function,
-- not tracked here.)
