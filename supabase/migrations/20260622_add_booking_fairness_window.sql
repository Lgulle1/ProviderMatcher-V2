-- =============================================================================
-- Add org-level booking fairness lookback window setting.
-- =============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS booking_fairness_window text NOT NULL DEFAULT 'all';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS booking_fairness_window_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT booking_fairness_window_check
  CHECK (booking_fairness_window IN ('all', '30d', '7d'));

COMMENT ON COLUMN public.organizations.booking_fairness_window IS
  'Lookback window for provider booking-count fairness: all time (all), last 30 days (30d), or last 7 days (7d).';

-- =============================================================================
-- ROLLBACK (commented — manual only)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS booking_fairness_window_check;
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS booking_fairness_window;
-- =============================================================================
