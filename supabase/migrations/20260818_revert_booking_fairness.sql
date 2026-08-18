-- =============================================================================
-- Revert booking-fairness sorting. It penalized providers who cover more
-- case types (e.g. a shoulder/hip/knee generalist racking up "bookings"
-- across all three and losing shoulder-specific placement to a
-- shoulder-only specialist). Results are pure-random ordered again, so
-- these org-level settings no longer do anything.
-- =============================================================================

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS booking_fairness_scope_check;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS booking_fairness_window_check;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS booking_fairness_scope;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS booking_fairness_window;

-- =============================================================================
-- ROLLBACK (commented — manual only)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS booking_fairness_scope text NOT NULL DEFAULT 'org';
-- ALTER TABLE public.organizations ADD CONSTRAINT booking_fairness_scope_check CHECK (booking_fairness_scope IN ('org', 'widget'));
-- ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS booking_fairness_window text NOT NULL DEFAULT 'all';
-- ALTER TABLE public.organizations ADD CONSTRAINT booking_fairness_window_check CHECK (booking_fairness_window IN ('all', '30d', '7d'));
-- =============================================================================
