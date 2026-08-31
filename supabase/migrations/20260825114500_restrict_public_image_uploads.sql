-- Publicly served storage must contain only the small raster formats used by
-- the UI. Bucket limits are the primary MIME/size enforcement; RLS adds path,
-- extension, MIME, and role checks for defense in depth.

UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'provider-images';

DROP POLICY IF EXISTS provider_images_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS provider_images_authenticated_update ON storage.objects;

CREATE POLICY provider_images_authenticated_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'provider-images'
    AND (storage.foldername(name))[1] = provider_matcher_private.get_user_org_id()::text
    AND provider_matcher_private.can_write()
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
    AND lower(coalesce(metadata ->> 'mimetype', '')) IN ('image/jpeg', 'image/png', 'image/webp')
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
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
    AND lower(coalesce(metadata ->> 'mimetype', '')) IN ('image/jpeg', 'image/png', 'image/webp')
  );

-- ROLLBACK: restore the storage policies and GIF bucket MIME entry from
-- 20260825110000_add_rbac_and_org_invitations.sql if GIF support is approved.
