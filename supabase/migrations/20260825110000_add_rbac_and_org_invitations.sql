-- Database-enforced RBAC. Existing accounts become owners to preserve current
-- behavior; future organization members default to viewer unless an owner has
-- created a matching pending invitation.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text;
UPDATE public.users SET role = 'owner' WHERE role IS NULL;
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'viewer';
ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_valid;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_valid CHECK (role IN ('viewer', 'editor', 'owner'));

CREATE OR REPLACE FUNCTION provider_matcher_private.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role FROM public.users AS u WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.can_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(provider_matcher_private.get_user_role() IN ('editor', 'owner'), false);
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(provider_matcher_private.get_user_role() = 'owner', false);
$$;

REVOKE ALL ON FUNCTION provider_matcher_private.get_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION provider_matcher_private.can_write() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION provider_matcher_private.is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION provider_matcher_private.get_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.can_write() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provider_matcher_private.is_owner() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'owner')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL REFERENCES public.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_pending_email_idx
  ON public.organization_invitations (lower(email))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS organization_invitations_org_created_idx
  ON public.organization_invitations (org_id, created_at DESC);

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_invitations_owner_select
  ON public.organization_invitations FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id() AND provider_matcher_private.is_owner());
CREATE POLICY organization_invitations_owner_insert
  ON public.organization_invitations FOR INSERT TO authenticated
  WITH CHECK (
    org_id = provider_matcher_private.get_user_org_id()
    AND invited_by = auth.uid()
    AND provider_matcher_private.is_owner()
  );
CREATE POLICY organization_invitations_owner_update
  ON public.organization_invitations FOR UPDATE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id() AND provider_matcher_private.is_owner())
  WITH CHECK (org_id = provider_matcher_private.get_user_org_id() AND provider_matcher_private.is_owner());
CREATE POLICY organization_invitations_owner_delete
  ON public.organization_invitations FOR DELETE TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id() AND provider_matcher_private.is_owner());

DROP POLICY IF EXISTS admin_audit_log_select_authenticated_org ON public.admin_audit_log;
CREATE POLICY admin_audit_log_select_owner_org
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id() AND provider_matcher_private.is_owner());

DROP TRIGGER IF EXISTS audit_users ON public.users;
CREATE TRIGGER audit_users
AFTER INSERT OR UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION provider_matcher_private.write_admin_audit_log();

DROP TRIGGER IF EXISTS audit_organization_invitations ON public.organization_invitations;
CREATE TRIGGER audit_organization_invitations
AFTER INSERT OR UPDATE OR DELETE ON public.organization_invitations
FOR EACH ROW EXECUTE FUNCTION provider_matcher_private.write_admin_audit_log();

CREATE OR REPLACE FUNCTION provider_matcher_private.enforce_configuration_write_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Service-role/database maintenance operations have no end-user auth uid.
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NOT provider_matcher_private.can_write() THEN
    RAISE EXCEPTION 'Editor or owner role required' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION provider_matcher_private.enforce_organization_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NOT provider_matcher_private.is_owner() THEN
    RAISE EXCEPTION 'Owner role required' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $write_role_triggers$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'locations', 'case_types', 'categories', 'providers', 'provider_locations',
    'constraints', 'offerings', 'questions', 'widgets', 'import_history'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'enforce_write_role_' || v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION provider_matcher_private.enforce_configuration_write_role()',
      'enforce_write_role_' || v_table,
      v_table
    );
  END LOOP;
END;
$write_role_triggers$;

DROP TRIGGER IF EXISTS enforce_owner_organizations ON public.organizations;
CREATE TRIGGER enforce_owner_organizations
BEFORE UPDATE OR DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION provider_matcher_private.enforce_organization_owner();

CREATE OR REPLACE FUNCTION provider_matcher_private.protect_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable user identity fields cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('provider_matcher.authorized_role_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Use set_organization_member_role to change roles' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_role ON public.users;
CREATE TRIGGER protect_user_role
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION provider_matcher_private.protect_user_role();

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_authenticated_org
  ON public.users FOR SELECT TO authenticated
  USING (org_id = provider_matcher_private.get_user_org_id());

CREATE OR REPLACE FUNCTION public.set_organization_member_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid := provider_matcher_private.get_user_org_id();
  v_current_role text;
BEGIN
  IF NOT provider_matcher_private.is_owner() THEN
    RAISE EXCEPTION 'Owner role required' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('viewer', 'editor', 'owner') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT role INTO v_current_role
  FROM public.users
  WHERE id = p_user_id AND org_id = v_org_id
  FOR UPDATE;
  IF v_current_role IS NULL THEN RAISE EXCEPTION 'Organization member not found'; END IF;

  IF v_current_role = 'owner' AND p_role <> 'owner' AND NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE org_id = v_org_id AND role = 'owner' AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Cannot demote the last organization owner';
  END IF;

  PERFORM set_config('provider_matcher.authorized_role_change', 'true', true);
  UPDATE public.users SET role = p_role WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_organization_member_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_member_role(uuid, text) TO authenticated;

-- Replace invite-only signup so a pending invitation determines tenant and
-- role. Editable auth user metadata is used only for display names/new-org
-- naming, never to assign an existing tenant.
CREATE OR REPLACE FUNCTION public.complete_signup(p_org_name text, p_user_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_invited_at timestamptz;
  v_invitation public.organization_invitations%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_user public.users%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'User profile already exists';
  END IF;

  SELECT invited_at, lower(email) INTO v_invited_at, v_email
  FROM auth.users WHERE id = v_uid;
  IF v_invited_at IS NULL THEN RAISE EXCEPTION 'An administrator invitation is required'; END IF;

  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE email = v_email AND status = 'pending' AND expires_at > now()
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_invitation.id IS NOT NULL THEN
    SELECT * INTO v_org FROM public.organizations WHERE id = v_invitation.org_id;
    INSERT INTO public.users (id, org_id, name, email, role)
    VALUES (v_uid, v_org.id, left(btrim(p_user_name), 200), v_email, v_invitation.role)
    RETURNING * INTO v_user;
    UPDATE public.organization_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_invitation.id;
  ELSE
    IF p_org_name IS NULL OR length(btrim(p_org_name)) NOT BETWEEN 2 AND 200 THEN
      RAISE EXCEPTION 'Organization name must be between 2 and 200 characters';
    END IF;
    IF p_user_name IS NULL OR length(btrim(p_user_name)) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'User name must be between 1 and 200 characters';
    END IF;
    INSERT INTO public.organizations (name) VALUES (btrim(p_org_name)) RETURNING * INTO v_org;
    INSERT INTO public.users (id, org_id, name, email, role)
    VALUES (v_uid, v_org.id, btrim(p_user_name), v_email, 'owner') RETURNING * INTO v_user;
  END IF;

  RETURN jsonb_build_object('org', to_jsonb(v_org), 'user', to_jsonb(v_user));
END;
$$;

REVOKE ALL ON FUNCTION public.complete_signup(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_signup(text, text) TO authenticated;

DROP POLICY IF EXISTS provider_images_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS provider_images_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS provider_images_authenticated_delete ON storage.objects;
CREATE POLICY provider_images_authenticated_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
    AND provider_matcher_private.can_write()
  );
CREATE POLICY provider_images_authenticated_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
    AND provider_matcher_private.can_write()
  )
  WITH CHECK (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
    AND provider_matcher_private.can_write()
  );
CREATE POLICY provider_images_authenticated_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
    AND provider_matcher_private.can_write()
  );

-- ROLLBACK requires restoring complete_signup and the storage policies from
-- earlier migrations, dropping role-enforcement triggers/functions, then
-- dropping organization_invitations and users.role after preserving access.
