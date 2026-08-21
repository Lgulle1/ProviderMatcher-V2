-- =============================================================================
-- Harden tenant isolation: RLS policies, private helpers, and storage.
-- Do NOT execute in CI/automation; apply manually after preflight review.
--
-- APP FOLLOW-UP (required when VITE_ENABLE_SIGNUP=true):
-- Replace separate organizations + users inserts in src/hooks/useAuth.ts with one
-- RPC call after auth.signUp():
--   const { data, error } = await supabase.rpc('complete_signup', {
--     p_org_name: orgName,
--     p_user_name: name,
--   })
-- Email is taken from auth.jwt() inside the function — do not pass email from client.
-- Parse returned org/user from data (jsonb) and hydrate auth store as today.
--
-- PostgREST: keep `provider_matcher_private` OUT of exposed schemas (default: public only).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- READ-ONLY PREFLIGHT: run each SELECT before applying. Rows = fix data first.
-- -----------------------------------------------------------------------------

-- offerings: provider_id org mismatch
-- SELECT o.id, o.org_id, o.provider_id, p.org_id AS provider_org_id
-- FROM public.offerings o
-- JOIN public.providers p ON p.id = o.provider_id
-- WHERE o.org_id IS DISTINCT FROM p.org_id;

-- offerings: provider_id missing
-- SELECT o.id, o.org_id, o.provider_id
-- FROM public.offerings o
-- LEFT JOIN public.providers p ON p.id = o.provider_id
-- WHERE p.id IS NULL;

-- offerings: case_type_id org mismatch
-- SELECT o.id, o.org_id, o.case_type_id, ct.org_id AS case_type_org_id
-- FROM public.offerings o
-- JOIN public.case_types ct ON ct.id = o.case_type_id
-- WHERE o.org_id IS DISTINCT FROM ct.org_id;

-- offerings: case_type_id missing
-- SELECT o.id, o.org_id, o.case_type_id
-- FROM public.offerings o
-- LEFT JOIN public.case_types ct ON ct.id = o.case_type_id
-- WHERE ct.id IS NULL;

-- offerings: location_ids outside org or missing
-- SELECT o.id, o.org_id, loc.elem AS location_id, l.org_id AS location_org_id
-- FROM public.offerings o
-- CROSS JOIN LATERAL unnest(COALESCE(o.location_ids, '{}'::uuid[])) AS loc(elem)
-- LEFT JOIN public.locations l ON l.id = loc.elem
-- WHERE l.id IS NULL OR l.org_id IS DISTINCT FROM o.org_id;

-- provider_locations: provider vs location org mismatch
-- SELECT pl.id, pl.provider_id, pl.location_id, p.org_id AS provider_org_id, l.org_id AS location_org_id
-- FROM public.provider_locations pl
-- JOIN public.providers p ON p.id = pl.provider_id
-- JOIN public.locations l ON l.id = pl.location_id
-- WHERE p.org_id IS DISTINCT FROM l.org_id;

-- provider_locations: missing provider
-- SELECT pl.id, pl.provider_id, pl.location_id
-- FROM public.provider_locations pl
-- LEFT JOIN public.providers p ON p.id = pl.provider_id
-- WHERE p.id IS NULL;

-- provider_locations: missing location
-- SELECT pl.id, pl.provider_id, pl.location_id
-- FROM public.provider_locations pl
-- LEFT JOIN public.locations l ON l.id = pl.location_id
-- WHERE l.id IS NULL;

-- questions: constraint_id org mismatch
-- SELECT q.id, q.org_id, q.constraint_id, c.org_id AS constraint_org_id
-- FROM public.questions q
-- JOIN public.constraints c ON c.id = q.constraint_id
-- WHERE q.constraint_id IS NOT NULL
--   AND q.org_id IS DISTINCT FROM c.org_id;

-- questions: constraint_id missing
-- SELECT q.id, q.org_id, q.constraint_id
-- FROM public.questions q
-- LEFT JOIN public.constraints c ON c.id = q.constraint_id
-- WHERE q.constraint_id IS NOT NULL
--   AND c.id IS NULL;

-- providers: category_ids outside org or missing
-- SELECT p.id, p.org_id, cat.elem AS category_id, c.org_id AS category_org_id
-- FROM public.providers p
-- CROSS JOIN LATERAL unnest(COALESCE(p.category_ids, '{}'::uuid[])) AS cat(elem)
-- LEFT JOIN public.categories c ON c.id = cat.elem
-- WHERE c.id IS NULL OR c.org_id IS DISTINCT FROM p.org_id;

-- widgets: scoped_provider_ids outside org or missing
-- SELECT w.id, w.org_id, pid.elem AS provider_id, p.org_id AS provider_org_id
-- FROM public.widgets w
-- CROSS JOIN LATERAL unnest(COALESCE(w.scoped_provider_ids, '{}'::uuid[])) AS pid(elem)
-- LEFT JOIN public.providers p ON p.id = pid.elem
-- WHERE p.id IS NULL OR p.org_id IS DISTINCT FROM w.org_id;

-- widgets: scoped_case_type_ids outside org or missing
-- SELECT w.id, w.org_id, ctid.elem AS case_type_id, ct.org_id AS case_type_org_id
-- FROM public.widgets w
-- CROSS JOIN LATERAL unnest(COALESCE(w.scoped_case_type_ids, '{}'::uuid[])) AS ctid(elem)
-- LEFT JOIN public.case_types ct ON ct.id = ctid.elem
-- WHERE ct.id IS NULL OR ct.org_id IS DISTINCT FROM w.org_id;

-- widgets: scoped_location_ids outside org or missing
-- SELECT w.id, w.org_id, lid.elem AS location_id, l.org_id AS location_org_id
-- FROM public.widgets w
-- CROSS JOIN LATERAL unnest(COALESCE(w.scoped_location_ids, '{}'::uuid[])) AS lid(elem)
-- LEFT JOIN public.locations l ON l.id = lid.elem
-- WHERE l.id IS NULL OR l.org_id IS DISTINCT FROM w.org_id;

-- widgets: scoped_question_ids outside org or missing
-- SELECT w.id, w.org_id, qid.elem AS question_id, q.org_id AS question_org_id
-- FROM public.widgets w
-- CROSS JOIN LATERAL unnest(COALESCE(w.scoped_question_ids, '{}'::uuid[])) AS qid(elem)
-- LEFT JOIN public.questions q ON q.id = qid.elem
-- WHERE q.id IS NULL OR q.org_id IS DISTINCT FROM w.org_id;

-- widget_sessions: org_id mismatches parent widget
-- SELECT ws.id, ws.session_id, ws.widget_id, ws.org_id AS session_org_id, w.org_id AS widget_org_id
-- FROM public.widget_sessions ws
-- JOIN public.widgets w ON w.id = ws.widget_id
-- WHERE ws.org_id IS DISTINCT FROM w.org_id;

-- widget_sessions: widget_id missing
-- SELECT ws.id, ws.session_id, ws.widget_id, ws.org_id
-- FROM public.widget_sessions ws
-- LEFT JOIN public.widgets w ON w.id = ws.widget_id
-- WHERE ws.widget_id IS NOT NULL
--   AND w.id IS NULL;

-- widget_sessions: org_id set but widget_id null (orphan org reference)
-- SELECT ws.id, ws.session_id, ws.org_id
-- FROM public.widget_sessions ws
-- WHERE ws.widget_id IS NULL
--   AND ws.org_id IS NOT NULL;

-- widget_session_events: org_id mismatches parent widget
-- SELECT wse.id, wse.session_id, wse.widget_id, wse.org_id AS event_org_id, w.org_id AS widget_org_id
-- FROM public.widget_session_events wse
-- JOIN public.widgets w ON w.id = wse.widget_id
-- WHERE wse.org_id IS DISTINCT FROM w.org_id;

-- widget_session_events: widget_id missing
-- SELECT wse.id, wse.session_id, wse.widget_id, wse.org_id
-- FROM public.widget_session_events wse
-- LEFT JOIN public.widgets w ON w.id = wse.widget_id
-- WHERE wse.widget_id IS NOT NULL
--   AND w.id IS NULL;

-- widget_session_events: org_id set but widget_id null
-- SELECT wse.id, wse.session_id, wse.org_id
-- FROM public.widget_session_events wse
-- WHERE wse.widget_id IS NULL
--   AND wse.org_id IS NOT NULL;

BEGIN;

-- =============================================================================
-- PROVIDER_MATCHER_PRIVATE SCHEMA (not exposed via PostgREST; internal RLS helpers only)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS provider_matcher_private;

REVOKE ALL ON SCHEMA provider_matcher_private FROM PUBLIC;
REVOKE ALL ON SCHEMA provider_matcher_private FROM anon;
GRANT USAGE ON SCHEMA provider_matcher_private TO authenticated;
GRANT USAGE ON SCHEMA provider_matcher_private TO service_role;

CREATE OR REPLACE FUNCTION provider_matcher_private.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.org_id
  FROM public.users AS u
  WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.user_update_valid(
  p_new_id uuid,
  p_new_org_id uuid,
  p_new_name text,
  p_new_email text,
  p_new_created_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.id = auth.uid()
      AND p_new_id = u.id
      AND p_new_org_id IS NOT DISTINCT FROM u.org_id
      AND p_new_email IS NOT DISTINCT FROM u.email
      AND p_new_created_at IS NOT DISTINCT FROM u.created_at
  );
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.all_category_ids_in_user_org(p_category_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_category_ids IS NULL
    OR cardinality(p_category_ids) = 0
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p_category_ids) AS cid(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.categories AS c
        WHERE c.id = cid.id
          AND c.org_id = provider_matcher_private.get_user_org_id()
      )
    );
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.all_location_ids_in_user_org(p_location_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_location_ids IS NULL
    OR cardinality(p_location_ids) = 0
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p_location_ids) AS lid(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.locations AS l
        WHERE l.id = lid.id
          AND l.org_id = provider_matcher_private.get_user_org_id()
      )
    );
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.all_provider_ids_in_user_org(p_provider_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_provider_ids IS NULL
    OR cardinality(p_provider_ids) = 0
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p_provider_ids) AS pid(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.providers AS p
        WHERE p.id = pid.id
          AND p.org_id = provider_matcher_private.get_user_org_id()
      )
    );
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.all_case_type_ids_in_user_org(p_case_type_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_case_type_ids IS NULL
    OR cardinality(p_case_type_ids) = 0
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p_case_type_ids) AS ctid(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.case_types AS ct
        WHERE ct.id = ctid.id
          AND ct.org_id = provider_matcher_private.get_user_org_id()
      )
    );
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.all_question_ids_in_user_org(p_question_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_question_ids IS NULL
    OR cardinality(p_question_ids) = 0
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p_question_ids) AS qid(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.questions AS q
        WHERE q.id = qid.id
          AND q.org_id = provider_matcher_private.get_user_org_id()
      )
    );
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.constraint_in_user_org(p_constraint_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_constraint_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.constraints AS c
      WHERE c.id = p_constraint_id
        AND c.org_id = provider_matcher_private.get_user_org_id()
    );
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.provider_in_user_org(p_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.providers AS p
    WHERE p.id = p_provider_id
      AND p.org_id = provider_matcher_private.get_user_org_id()
  );
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.location_in_user_org(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.locations AS l
    WHERE l.id = p_location_id
      AND l.org_id = provider_matcher_private.get_user_org_id()
  );
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.offering_relationships_valid(
  p_org_id uuid,
  p_provider_id uuid,
  p_case_type_id uuid,
  p_location_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_org_id = provider_matcher_private.get_user_org_id()
    AND provider_matcher_private.provider_in_user_org(p_provider_id)
    AND EXISTS (
      SELECT 1
      FROM public.case_types AS ct
      WHERE ct.id = p_case_type_id
        AND ct.org_id = p_org_id
    )
    AND provider_matcher_private.all_location_ids_in_user_org(p_location_ids);
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.provider_location_pair_valid(
  p_provider_id uuid,
  p_location_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    provider_matcher_private.provider_in_user_org(p_provider_id)
    AND provider_matcher_private.location_in_user_org(p_location_id);
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.widget_scoped_relationships_valid(
  p_org_id uuid,
  p_scoped_provider_ids uuid[],
  p_scoped_case_type_ids uuid[],
  p_scoped_location_ids uuid[],
  p_scoped_question_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_org_id = provider_matcher_private.get_user_org_id()
    AND provider_matcher_private.all_provider_ids_in_user_org(p_scoped_provider_ids)
    AND provider_matcher_private.all_case_type_ids_in_user_org(p_scoped_case_type_ids)
    AND provider_matcher_private.all_location_ids_in_user_org(p_scoped_location_ids)
    AND provider_matcher_private.all_question_ids_in_user_org(p_scoped_question_ids);
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA provider_matcher_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA provider_matcher_private FROM anon;

GRANT EXECUTE ON FUNCTION provider_matcher_private.get_user_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.user_update_valid(uuid, uuid, text, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.all_category_ids_in_user_org(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.all_location_ids_in_user_org(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.all_provider_ids_in_user_org(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.all_case_type_ids_in_user_org(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.all_question_ids_in_user_org(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.constraint_in_user_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.provider_in_user_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.location_in_user_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.offering_relationships_valid(uuid, uuid, uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.provider_location_pair_valid(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.widget_scoped_relationships_valid(uuid, uuid[], uuid[], uuid[], uuid[]) TO authenticated, service_role;

-- =============================================================================
-- PUBLIC RPC: atomic signup (only public SECURITY DEFINER entry point)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.complete_signup(
  p_org_name text,
  p_user_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_org public.organizations%ROWTYPE;
  v_user public.users%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users AS u WHERE u.id = v_uid) THEN
    RAISE EXCEPTION 'User profile already exists';
  END IF;

  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RAISE EXCEPTION 'Authenticated email claim is required';
  END IF;

  IF p_org_name IS NULL OR length(btrim(p_org_name)) < 2 THEN
    RAISE EXCEPTION 'Organization name must be at least 2 characters';
  END IF;

  IF length(btrim(p_org_name)) > 200 THEN
    RAISE EXCEPTION 'Organization name must be at most 200 characters';
  END IF;

  IF p_user_name IS NULL OR length(btrim(p_user_name)) < 1 THEN
    RAISE EXCEPTION 'User name is required';
  END IF;

  IF length(btrim(p_user_name)) > 200 THEN
    RAISE EXCEPTION 'User name must be at most 200 characters';
  END IF;

  INSERT INTO public.organizations (name)
  VALUES (btrim(p_org_name))
  RETURNING * INTO v_org;

  INSERT INTO public.users (id, org_id, name, email)
  VALUES (v_uid, v_org.id, btrim(p_user_name), lower(btrim(v_email)))
  RETURNING * INTO v_user;

  RETURN jsonb_build_object(
    'org', to_jsonb(v_org),
    'user', to_jsonb(v_user)
  );
END;
$$;

COMMENT ON FUNCTION public.complete_signup(text, text) IS
  'Atomically creates organization + user profile for a new authenticated account.';

REVOKE ALL ON FUNCTION public.complete_signup(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_signup(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_signup(text, text) TO authenticated;

-- =============================================================================
-- DROP NEW MIGRATION POLICIES (idempotent re-run; before legacy + function drops)
-- =============================================================================

DROP POLICY IF EXISTS organizations_select_authenticated_org ON public.organizations;
DROP POLICY IF EXISTS organizations_update_authenticated_org ON public.organizations;
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_insert_signup ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;
DROP POLICY IF EXISTS locations_select_authenticated_org ON public.locations;
DROP POLICY IF EXISTS locations_insert_authenticated_org ON public.locations;
DROP POLICY IF EXISTS locations_update_authenticated_org ON public.locations;
DROP POLICY IF EXISTS locations_delete_authenticated_org ON public.locations;
DROP POLICY IF EXISTS case_types_select_authenticated_org ON public.case_types;
DROP POLICY IF EXISTS case_types_insert_authenticated_org ON public.case_types;
DROP POLICY IF EXISTS case_types_update_authenticated_org ON public.case_types;
DROP POLICY IF EXISTS case_types_delete_authenticated_org ON public.case_types;
DROP POLICY IF EXISTS categories_select_authenticated_org ON public.categories;
DROP POLICY IF EXISTS categories_insert_authenticated_org ON public.categories;
DROP POLICY IF EXISTS categories_update_authenticated_org ON public.categories;
DROP POLICY IF EXISTS categories_delete_authenticated_org ON public.categories;
DROP POLICY IF EXISTS providers_select_authenticated_org ON public.providers;
DROP POLICY IF EXISTS providers_insert_authenticated_org ON public.providers;
DROP POLICY IF EXISTS providers_update_authenticated_org ON public.providers;
DROP POLICY IF EXISTS providers_delete_authenticated_org ON public.providers;
DROP POLICY IF EXISTS provider_locations_select_authenticated_org ON public.provider_locations;
DROP POLICY IF EXISTS provider_locations_insert_authenticated_org ON public.provider_locations;
DROP POLICY IF EXISTS provider_locations_update_authenticated_org ON public.provider_locations;
DROP POLICY IF EXISTS provider_locations_delete_authenticated_org ON public.provider_locations;
DROP POLICY IF EXISTS constraints_select_authenticated_org ON public.constraints;
DROP POLICY IF EXISTS constraints_insert_authenticated_org ON public.constraints;
DROP POLICY IF EXISTS constraints_update_authenticated_org ON public.constraints;
DROP POLICY IF EXISTS constraints_delete_authenticated_org ON public.constraints;
DROP POLICY IF EXISTS offerings_select_authenticated_org ON public.offerings;
DROP POLICY IF EXISTS offerings_insert_authenticated_org ON public.offerings;
DROP POLICY IF EXISTS offerings_update_authenticated_org ON public.offerings;
DROP POLICY IF EXISTS offerings_delete_authenticated_org ON public.offerings;
DROP POLICY IF EXISTS questions_select_authenticated_org ON public.questions;
DROP POLICY IF EXISTS questions_insert_authenticated_org ON public.questions;
DROP POLICY IF EXISTS questions_update_authenticated_org ON public.questions;
DROP POLICY IF EXISTS questions_delete_authenticated_org ON public.questions;
DROP POLICY IF EXISTS widgets_select_authenticated_org ON public.widgets;
DROP POLICY IF EXISTS widgets_insert_authenticated_org ON public.widgets;
DROP POLICY IF EXISTS widgets_update_authenticated_org ON public.widgets;
DROP POLICY IF EXISTS widgets_delete_authenticated_org ON public.widgets;
DROP POLICY IF EXISTS import_history_select_authenticated_org ON public.import_history;
DROP POLICY IF EXISTS import_history_insert_authenticated_org ON public.import_history;
DROP POLICY IF EXISTS import_history_update_authenticated_org ON public.import_history;
DROP POLICY IF EXISTS import_history_delete_authenticated_org ON public.import_history;
DROP POLICY IF EXISTS widget_sessions_select_authenticated_org ON public.widget_sessions;
DROP POLICY IF EXISTS widget_session_events_select_authenticated_org ON public.widget_session_events;

DROP POLICY IF EXISTS provider_images_public_read ON storage.objects;
DROP POLICY IF EXISTS provider_images_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS provider_images_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS provider_images_authenticated_delete ON storage.objects;

-- =============================================================================
-- DROP VERIFIED LIVE LEGACY POLICIES (exact names; before public.get_user_org_id drop)
-- =============================================================================

DROP POLICY IF EXISTS case_types_all ON public.case_types;
DROP POLICY IF EXISTS categories_all ON public.categories;
DROP POLICY IF EXISTS constraints_all ON public.constraints;
DROP POLICY IF EXISTS import_history_all ON public.import_history;
DROP POLICY IF EXISTS locations_all ON public.locations;
DROP POLICY IF EXISTS offerings_all ON public.offerings;
DROP POLICY IF EXISTS org_insert ON public.organizations;
DROP POLICY IF EXISTS org_select ON public.organizations;
DROP POLICY IF EXISTS org_update ON public.organizations;
DROP POLICY IF EXISTS provider_locations_all ON public.provider_locations;
DROP POLICY IF EXISTS providers_all ON public.providers;
DROP POLICY IF EXISTS questions_all ON public.questions;
DROP POLICY IF EXISTS user_insert ON public.users;
DROP POLICY IF EXISTS user_select ON public.users;
DROP POLICY IF EXISTS user_update ON public.users;
DROP POLICY IF EXISTS session_events_insert ON public.widget_session_events;
DROP POLICY IF EXISTS session_events_org_select ON public.widget_session_events;
DROP POLICY IF EXISTS sessions_insert ON public.widget_sessions;
DROP POLICY IF EXISTS sessions_select ON public.widget_sessions;
DROP POLICY IF EXISTS widgets_all ON public.widgets;

-- Harmless cleanup for guessed legacy names from earlier drafts (non-authoritative)
DROP POLICY IF EXISTS "Enable insert for organizations" ON public.organizations;
DROP POLICY IF EXISTS organizations_insert_public ON public.organizations;
DROP POLICY IF EXISTS "Enable insert for widget_sessions" ON public.widget_sessions;
DROP POLICY IF EXISTS widget_sessions_insert_public ON public.widget_sessions;
DROP POLICY IF EXISTS "Enable insert for widget_session_events" ON public.widget_session_events;
DROP POLICY IF EXISTS widget_session_events_insert_public ON public.widget_session_events;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS users_insert_authenticated ON public.users;
DROP POLICY IF EXISTS users_update_authenticated ON public.users;
DROP POLICY IF EXISTS users_select_authenticated ON public.users;
DROP POLICY IF EXISTS organizations_select_org ON public.organizations;
DROP POLICY IF EXISTS organizations_update_org ON public.organizations;
DROP POLICY IF EXISTS locations_all_org ON public.locations;
DROP POLICY IF EXISTS case_types_all_org ON public.case_types;
DROP POLICY IF EXISTS categories_all_org ON public.categories;
DROP POLICY IF EXISTS providers_all_org ON public.providers;
DROP POLICY IF EXISTS provider_locations_all_org ON public.provider_locations;
DROP POLICY IF EXISTS constraints_all_org ON public.constraints;
DROP POLICY IF EXISTS offerings_all_org ON public.offerings;
DROP POLICY IF EXISTS questions_all_org ON public.questions;
DROP POLICY IF EXISTS widgets_all_org ON public.widgets;
DROP POLICY IF EXISTS import_history_all_org ON public.import_history;
DROP POLICY IF EXISTS widget_sessions_select_org ON public.widget_sessions;
DROP POLICY IF EXISTS widget_session_events_select_org ON public.widget_session_events;

-- Remove superseded public helpers from prior drafts / remote schema.
-- Must run only after all policies referencing public.get_user_org_id() are dropped.
DROP FUNCTION IF EXISTS public.create_organization_for_signup(text);
DROP FUNCTION IF EXISTS public.user_org_id_unchanged(uuid);
DROP FUNCTION IF EXISTS public.get_user_org_id();
DROP FUNCTION IF EXISTS public.all_category_ids_in_user_org(uuid[]);
DROP FUNCTION IF EXISTS public.all_location_ids_in_user_org(uuid[]);
DROP FUNCTION IF EXISTS public.all_provider_ids_in_user_org(uuid[]);
DROP FUNCTION IF EXISTS public.all_case_type_ids_in_user_org(uuid[]);
DROP FUNCTION IF EXISTS public.all_question_ids_in_user_org(uuid[]);
DROP FUNCTION IF EXISTS public.constraint_in_user_org(uuid);
DROP FUNCTION IF EXISTS public.provider_in_user_org(uuid);
DROP FUNCTION IF EXISTS public.location_in_user_org(uuid);
DROP FUNCTION IF EXISTS public.offering_relationships_valid(uuid, uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.provider_location_pair_valid(uuid, uuid);
DROP FUNCTION IF EXISTS public.widget_scoped_relationships_valid(uuid, uuid[], uuid[], uuid[], uuid[]);

-- =============================================================================
-- PUBLIC TABLE RLS POLICIES (authenticated tenants only)
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_session_events ENABLE ROW LEVEL SECURITY;

-- organizations: no direct INSERT (use complete_signup)
CREATE POLICY organizations_select_authenticated_org
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (id = provider_matcher_private.get_user_org_id());

CREATE POLICY organizations_update_authenticated_org
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (id = provider_matcher_private.get_user_org_id())
  WITH CHECK (id = provider_matcher_private.get_user_org_id());

-- users: profiles created only via complete_signup; no INSERT policy
CREATE POLICY users_select_own
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_update_own
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    provider_matcher_private.user_update_valid(id, org_id, name, email, created_at)
  );

CREATE POLICY locations_select_authenticated_org
  ON public.locations FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY locations_insert_authenticated_org
  ON public.locations FOR INSERT TO authenticated
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY locations_update_authenticated_org
  ON public.locations FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id())
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY locations_delete_authenticated_org
  ON public.locations FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY case_types_select_authenticated_org
  ON public.case_types FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY case_types_insert_authenticated_org
  ON public.case_types FOR INSERT TO authenticated
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY case_types_update_authenticated_org
  ON public.case_types FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id())
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY case_types_delete_authenticated_org
  ON public.case_types FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY categories_select_authenticated_org
  ON public.categories FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY categories_insert_authenticated_org
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY categories_update_authenticated_org
  ON public.categories FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id())
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY categories_delete_authenticated_org
  ON public.categories FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY providers_select_authenticated_org
  ON public.providers FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY providers_insert_authenticated_org
  ON public.providers FOR INSERT TO authenticated
  WITH CHECK (
    org_id = provider_matcher_private.get_user_org_id()
    AND provider_matcher_private.all_category_ids_in_user_org(category_ids)
  );

CREATE POLICY providers_update_authenticated_org
  ON public.providers FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id())
  WITH CHECK (
    org_id = provider_matcher_private.get_user_org_id()
    AND provider_matcher_private.all_category_ids_in_user_org(category_ids)
  );

CREATE POLICY providers_delete_authenticated_org
  ON public.providers FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY provider_locations_select_authenticated_org
  ON public.provider_locations FOR SELECT TO authenticated
  USING (provider_matcher_private.provider_location_pair_valid(provider_id, location_id));

CREATE POLICY provider_locations_insert_authenticated_org
  ON public.provider_locations FOR INSERT TO authenticated
  WITH CHECK (provider_matcher_private.provider_location_pair_valid(provider_id, location_id));

CREATE POLICY provider_locations_update_authenticated_org
  ON public.provider_locations FOR UPDATE TO authenticated
  USING (provider_matcher_private.provider_location_pair_valid(provider_id, location_id))
  WITH CHECK (provider_matcher_private.provider_location_pair_valid(provider_id, location_id));

CREATE POLICY provider_locations_delete_authenticated_org
  ON public.provider_locations FOR DELETE TO authenticated
  USING (provider_matcher_private.provider_location_pair_valid(provider_id, location_id));

CREATE POLICY constraints_select_authenticated_org
  ON public.constraints FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY constraints_insert_authenticated_org
  ON public.constraints FOR INSERT TO authenticated
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY constraints_update_authenticated_org
  ON public.constraints FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id())
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY constraints_delete_authenticated_org
  ON public.constraints FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY offerings_select_authenticated_org
  ON public.offerings FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY offerings_insert_authenticated_org
  ON public.offerings FOR INSERT TO authenticated
  WITH CHECK (
    provider_matcher_private.offering_relationships_valid(org_id, provider_id, case_type_id, location_ids)
  );

CREATE POLICY offerings_update_authenticated_org
  ON public.offerings FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id())
  WITH CHECK (
    provider_matcher_private.offering_relationships_valid(org_id, provider_id, case_type_id, location_ids)
  );

CREATE POLICY offerings_delete_authenticated_org
  ON public.offerings FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY questions_select_authenticated_org
  ON public.questions FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY questions_insert_authenticated_org
  ON public.questions FOR INSERT TO authenticated
  WITH CHECK (
    org_id = provider_matcher_private.get_user_org_id()
    AND provider_matcher_private.constraint_in_user_org(constraint_id)
  );

CREATE POLICY questions_update_authenticated_org
  ON public.questions FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id())
  WITH CHECK (
    org_id = provider_matcher_private.get_user_org_id()
    AND provider_matcher_private.constraint_in_user_org(constraint_id)
  );

CREATE POLICY questions_delete_authenticated_org
  ON public.questions FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY widgets_select_authenticated_org
  ON public.widgets FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY widgets_insert_authenticated_org
  ON public.widgets FOR INSERT TO authenticated
  WITH CHECK (
    provider_matcher_private.widget_scoped_relationships_valid(
      org_id,
      scoped_provider_ids,
      scoped_case_type_ids,
      scoped_location_ids,
      scoped_question_ids
    )
  );

CREATE POLICY widgets_update_authenticated_org
  ON public.widgets FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id())
  WITH CHECK (
    provider_matcher_private.widget_scoped_relationships_valid(
      org_id,
      scoped_provider_ids,
      scoped_case_type_ids,
      scoped_location_ids,
      scoped_question_ids
    )
  );

CREATE POLICY widgets_delete_authenticated_org
  ON public.widgets FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY import_history_select_authenticated_org
  ON public.import_history FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY import_history_insert_authenticated_org
  ON public.import_history FOR INSERT TO authenticated
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY import_history_update_authenticated_org
  ON public.import_history FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id())
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY import_history_delete_authenticated_org
  ON public.import_history FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

-- Analytics reads for admin app; writes only via service-role edge functions.
CREATE POLICY widget_sessions_select_authenticated_org
  ON public.widget_sessions FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE POLICY widget_session_events_select_authenticated_org
  ON public.widget_session_events FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

-- =============================================================================
-- STORAGE: provider-images bucket (public read, org-folder writes)
-- Path convention: {org_id}/{provider_id}.{ext}
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'provider-images',
  'provider-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- storage.objects is managed by Supabase and already has RLS enabled.
-- The project postgres role is not the table owner, so do not ALTER this table.

CREATE POLICY provider_images_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'provider-images');

CREATE POLICY provider_images_authenticated_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
  );

CREATE POLICY provider_images_authenticated_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
  )
  WITH CHECK (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
  );

CREATE POLICY provider_images_authenticated_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
  );

-- =============================================================================
-- POST-MIGRATION VERIFICATION (fails transaction if invariants broken)
-- Excludes intentional storage.objects public SELECT (provider_images_public_read).
-- =============================================================================

DO $verify_migration$
DECLARE
  v_public_anon_policies text;
  v_legacy_policies text;
  v_widget_write_policies text;
BEGIN
  SELECT string_agg(format('%I on public.%I (%s)', policyname, tablename, cmd), ', ')
  INTO v_public_anon_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY (ARRAY[
      'organizations',
      'users',
      'locations',
      'case_types',
      'categories',
      'providers',
      'provider_locations',
      'constraints',
      'offerings',
      'questions',
      'widgets',
      'import_history',
      'widget_sessions',
      'widget_session_events'
    ])
    AND ('public' = ANY (roles) OR 'anon' = ANY (roles));

  IF v_public_anon_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration verification failed: public/anon policies on application tables: %',
      v_public_anon_policies;
  END IF;

  SELECT string_agg(format('%I on public.%I', policyname, tablename), ', ')
  INTO v_legacy_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname = ANY (ARRAY[
      'case_types_all',
      'categories_all',
      'constraints_all',
      'import_history_all',
      'locations_all',
      'offerings_all',
      'org_insert',
      'org_select',
      'org_update',
      'provider_locations_all',
      'providers_all',
      'questions_all',
      'user_insert',
      'user_select',
      'user_update',
      'session_events_insert',
      'session_events_org_select',
      'sessions_insert',
      'sessions_select',
      'widgets_all'
    ]);

  IF v_legacy_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration verification failed: verified legacy policies still exist: %',
      v_legacy_policies;
  END IF;

  SELECT string_agg(format('%I on public.%I (%s)', policyname, tablename, cmd), ', ')
  INTO v_widget_write_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('widget_sessions', 'widget_session_events')
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');

  IF v_widget_write_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration verification failed: widget analytics write policies exist: %',
      v_widget_write_policies;
  END IF;
END;
$verify_migration$;

COMMIT;

-- =============================================================================
-- ROLLBACK (commented — manual only)
-- -----------------------------------------------------------------------------
-- BEGIN;
--   -- Drop migration policies (see DROP sections above).
--   DROP FUNCTION IF EXISTS public.complete_signup(text, text);
--   DROP SCHEMA IF EXISTS provider_matcher_private CASCADE;
--   DELETE FROM storage.buckets WHERE id = 'provider-images';
--   -- Restore legacy permissive policies from remote schema dump.
-- COMMIT;
-- =============================================================================
