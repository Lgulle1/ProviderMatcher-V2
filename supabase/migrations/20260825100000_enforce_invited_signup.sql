-- Enforce invite-only onboarding at the database boundary. Hiding the signup
-- form with VITE_ENABLE_SIGNUP is presentation only; a caller can always use
-- the public Supabase Auth API directly. This RPC therefore refuses to create
-- application data unless the authenticated auth.users row was invited.

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
  v_invited_at timestamptz;
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

  SELECT au.invited_at
  INTO v_invited_at
  FROM auth.users AS au
  WHERE au.id = v_uid;

  IF v_invited_at IS NULL THEN
    RAISE EXCEPTION 'An administrator invitation is required';
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

REVOKE ALL ON FUNCTION public.complete_signup(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_signup(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_signup(text, text) TO authenticated;

-- ROLLBACK (manual): restore complete_signup from
-- 20260619105639_harden_tenant_security.sql. Do not remove the invitation
-- check without also enabling and documenting an approved self-service flow.
