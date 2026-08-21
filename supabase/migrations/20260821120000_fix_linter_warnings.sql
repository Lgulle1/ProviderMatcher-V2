-- Fixes for Supabase database linter WARN findings (2026-08-21).

-- 1) function_search_path_mutable: pin search_path so these functions can't be
--    hijacked by a role that creates objects earlier in an unqualified search_path.
alter function public.normalize_name(text) set search_path = public, pg_temp;
alter function public.update_updated_at() set search_path = public, pg_temp;

-- 2) extension_in_public: pg_trgm was installed in `public`. Verified no indexes,
--    functions, or app code currently reference trigram operators/opclasses, so
--    this relocation is behavior-neutral.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- 3) public_bucket_allows_listing: `provider-images` is a public bucket
--    (storage.buckets.public = true), so individual object downloads
--    (getPublicUrl / <img src>) are already served via the public CDN path and
--    never touch this policy. Its only effect was letting anyone LIST/enumerate
--    every file in the bucket via the storage API or the storage.objects table.
--    Verified the app never calls storage.list() on this bucket (only upload/
--    getPublicUrl/remove), so removing SELECT does not break anything.
drop policy if exists provider_images_public_read on storage.objects;
