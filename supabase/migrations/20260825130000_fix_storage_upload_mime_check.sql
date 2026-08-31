-- 20260825114500 added a MIME condition to the provider-images INSERT policy:
--
--   AND lower(coalesce(metadata ->> 'mimetype', '')) IN (...)
--
-- storage-api inserts the storage.objects row before it populates metadata, so
-- at INSERT time metadata is null, coalesce yields '', and the check can never
-- be true. Every authenticated upload failed with "new row violates row-level
-- security policy" -- provider image uploads were broken outright, not only in
-- the integration suite that caught it.
--
-- The bucket's allowed_mime_types is the real MIME gate (and 20260825114500's
-- own comment says so: "Bucket limits are the primary MIME/size enforcement").
-- Storage rejects a disallowed content type before it reaches this policy, so
-- dropping the condition from INSERT loses no enforcement. Path, extension, and
-- role checks all stay.
--
-- UPDATE keeps its MIME check: by then the row exists and metadata is populated,
-- so the condition is meaningful there.

DROP POLICY IF EXISTS provider_images_authenticated_insert ON storage.objects;

CREATE POLICY provider_images_authenticated_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
    AND provider_matcher_private.can_write()
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  );

-- The second half of the same breakage. Both upload paths in the app use
-- upsert (src/lib/api/providers.ts and src/lib/api/widgets.ts), which becomes
-- INSERT ... ON CONFLICT DO UPDATE, and Postgres requires SELECT and UPDATE
-- policies on the table for that form. 20260821120000 dropped
-- provider_images_public_read to stop anonymous enumeration of the bucket,
-- which was correct, but it left storage.objects with no SELECT policy at all
-- -- so every authenticated upsert has been denied ever since. That migration
-- checked the app never calls storage.list(); the upsert dependency is less
-- obvious and was missed.
--
-- This restores only what the upsert needs: authenticated users may read
-- objects inside their own org folder. Anonymous enumeration stays closed,
-- since anon gets no policy, and public image serving is unaffected because
-- getPublicUrl is served by the CDN path and never consults RLS.

DROP POLICY IF EXISTS provider_images_authenticated_select ON storage.objects;

CREATE POLICY provider_images_authenticated_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
  );

-- ROLLBACK: drop provider_images_authenticated_select and restore the INSERT
-- policy from 20260825114500, accepting that authenticated uploads break again.
