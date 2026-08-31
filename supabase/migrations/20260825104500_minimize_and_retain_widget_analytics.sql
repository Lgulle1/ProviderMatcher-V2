-- Remove legacy readable clinical answers and enforce a 90-day retention
-- window for raw widget telemetry. Administrative audit records are separate
-- and are not affected by this policy.

UPDATE public.widget_sessions
SET answers = '{}'::jsonb
WHERE answers IS DISTINCT FROM '{}'::jsonb;

UPDATE public.widget_session_events
SET
  question_text = NULL,
  answer_text = CASE
    WHEN event_type = 'results_shown' AND answer_text IN ('browse_all', 'matched')
      THEN answer_text
    ELSE NULL
  END
WHERE
  question_text IS NOT NULL
  OR answer_text IS NOT NULL;

CREATE OR REPLACE FUNCTION provider_matcher_private.prune_widget_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.widget_session_events
  WHERE created_at < now() - interval '90 days';

  DELETE FROM public.widget_sessions
  WHERE created_at < now() - interval '90 days';
END;
$$;

REVOKE ALL ON FUNCTION provider_matcher_private.prune_widget_analytics() FROM PUBLIC;
REVOKE ALL ON FUNCTION provider_matcher_private.prune_widget_analytics() FROM anon;
REVOKE ALL ON FUNCTION provider_matcher_private.prune_widget_analytics() FROM authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $schedule_retention$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'provider-matcher-prune-widget-analytics';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'provider-matcher-prune-widget-analytics',
    '17 4 * * *',
    'SELECT provider_matcher_private.prune_widget_analytics()'
  );
END;
$schedule_retention$;

-- ROLLBACK (manual): unschedule provider-matcher-prune-widget-analytics and
-- drop provider_matcher_private.prune_widget_analytics(). Deleted telemetry
-- is intentionally not recoverable from the application database.
