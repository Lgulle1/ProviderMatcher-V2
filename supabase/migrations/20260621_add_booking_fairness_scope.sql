-- =============================================================================
-- Add org-level booking fairness scope setting.
-- =============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS booking_fairness_scope text NOT NULL DEFAULT 'org';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS booking_fairness_scope_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT booking_fairness_scope_check
  CHECK (booking_fairness_scope IN ('org', 'widget'));

COMMENT ON COLUMN public.organizations.booking_fairness_scope IS
  'Whether widget booking-count fairness is org-wide (org) or per-widget (widget).';

-- =============================================================================
-- ROLLBACK (commented — manual only)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS booking_fairness_scope_check;
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS booking_fairness_scope;
-- =============================================================================
