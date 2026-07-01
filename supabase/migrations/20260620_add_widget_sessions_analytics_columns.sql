-- =============================================================================
-- Add analytics payload columns to widget_sessions.
-- Existing columns are unchanged.
-- =============================================================================

ALTER TABLE public.widget_sessions
  ADD COLUMN IF NOT EXISTS results_positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clicks_detail jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scroll_depth jsonb DEFAULT NULL;

COMMENT ON COLUMN public.widget_sessions.results_positions IS
  'Ordered result cards shown, e.g. [{"provider_id":"...","position":1,"booking_count_at_time":3}]';

COMMENT ON COLUMN public.widget_sessions.clicks_detail IS
  'Per-click metadata, e.g. [{"provider_id":"...","position_at_click":2,"click_order":1,"clicked_at":"..."}]';

COMMENT ON COLUMN public.widget_sessions.scroll_depth IS
  'Results engagement summary, e.g. {"max_position_seen":3,"time_in_results_ms":8500}';

-- =============================================================================
-- ROLLBACK (commented — manual only)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.widget_sessions
--   DROP COLUMN IF EXISTS results_positions,
--   DROP COLUMN IF EXISTS clicks_detail,
--   DROP COLUMN IF EXISTS scroll_depth;
-- =============================================================================
