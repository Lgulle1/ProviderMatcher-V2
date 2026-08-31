-- Prevent unsafe schemes from ever reaching the patient-facing widget. These
-- constraints are NOT VALID so deployment is not blocked by legacy rows; they
-- are enforced for all new/changed rows immediately. Review and clean existing
-- violations, then VALIDATE each constraint in a separate approved migration.

ALTER TABLE public.providers
  ADD CONSTRAINT providers_bio_link_https
  CHECK (bio_link IS NULL OR bio_link ~* '^https://[^[:space:]]+$')
  NOT VALID;

ALTER TABLE public.provider_locations
  ADD CONSTRAINT provider_locations_booking_link_https
  CHECK (booking_link IS NULL OR booking_link ~* '^https://[^[:space:]]+$')
  NOT VALID;

ALTER TABLE public.provider_locations
  ADD CONSTRAINT provider_locations_bio_link_https
  CHECK (bio_link IS NULL OR bio_link ~* '^https://[^[:space:]]+$')
  NOT VALID;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_directions_url_https
  CHECK (directions_url IS NULL OR directions_url ~* '^https://[^[:space:]]+$')
  NOT VALID;

ALTER TABLE public.widgets
  ADD CONSTRAINT widgets_image_icon_https
  CHECK (
    button_icon_type <> 'image'
    OR button_icon_value IS NULL
    OR button_icon_value ~* '^https://[^[:space:]]+$'
  )
  NOT VALID;

-- ROLLBACK (manual):
-- ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_bio_link_https;
-- ALTER TABLE public.provider_locations DROP CONSTRAINT IF EXISTS provider_locations_booking_link_https;
-- ALTER TABLE public.provider_locations DROP CONSTRAINT IF EXISTS provider_locations_bio_link_https;
-- ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_directions_url_https;
-- ALTER TABLE public.widgets DROP CONSTRAINT IF EXISTS widgets_image_icon_https;
