-- =============================================================================
-- Widget floating-button display settings: open delay, hover animation,
-- a subheader line under the button text, and a left-side icon (emoji or
-- uploaded image) so the button can feel like it leads to a real person.
-- =============================================================================

ALTER TABLE public.widgets
  ADD COLUMN IF NOT EXISTS open_delay_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.widgets
  ADD COLUMN IF NOT EXISTS open_delay_seconds integer NOT NULL DEFAULT 5;

ALTER TABLE public.widgets
  DROP CONSTRAINT IF EXISTS open_delay_seconds_check;

ALTER TABLE public.widgets
  ADD CONSTRAINT open_delay_seconds_check
  CHECK (open_delay_seconds >= 0 AND open_delay_seconds <= 300);

ALTER TABLE public.widgets
  ADD COLUMN IF NOT EXISTS button_animation text NOT NULL DEFAULT 'none';

ALTER TABLE public.widgets
  DROP CONSTRAINT IF EXISTS button_animation_check;

ALTER TABLE public.widgets
  ADD CONSTRAINT button_animation_check
  CHECK (button_animation IN ('none', 'shake', 'wobble', 'pulse', 'bounce'));

ALTER TABLE public.widgets
  ADD COLUMN IF NOT EXISTS button_subtext text;

ALTER TABLE public.widgets
  ADD COLUMN IF NOT EXISTS button_icon_type text NOT NULL DEFAULT 'none';

ALTER TABLE public.widgets
  DROP CONSTRAINT IF EXISTS button_icon_type_check;

ALTER TABLE public.widgets
  ADD CONSTRAINT button_icon_type_check
  CHECK (button_icon_type IN ('none', 'emoji', 'image'));

ALTER TABLE public.widgets
  ADD COLUMN IF NOT EXISTS button_icon_value text;

COMMENT ON COLUMN public.widgets.open_delay_enabled IS
  'Whether the floating button waits before appearing instead of showing immediately on page load.';
COMMENT ON COLUMN public.widgets.open_delay_seconds IS
  'Seconds to wait before the floating button appears, when open_delay_enabled is true.';
COMMENT ON COLUMN public.widgets.button_animation IS
  'Subtle hover animation on the floating button: none, shake, wobble, pulse, or bounce.';
COMMENT ON COLUMN public.widgets.button_subtext IS
  'Optional smaller line shown under the button text, e.g. "Takes less than 60 seconds".';
COMMENT ON COLUMN public.widgets.button_icon_type IS
  'What to show on the left of the button text: none, an emoji, or an uploaded image.';
COMMENT ON COLUMN public.widgets.button_icon_value IS
  'The emoji character or image URL for button_icon_type.';

-- =============================================================================
-- ROLLBACK (commented — manual only)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.widgets DROP CONSTRAINT IF EXISTS open_delay_seconds_check;
-- ALTER TABLE public.widgets DROP CONSTRAINT IF EXISTS button_animation_check;
-- ALTER TABLE public.widgets DROP CONSTRAINT IF EXISTS button_icon_type_check;
-- ALTER TABLE public.widgets DROP COLUMN IF EXISTS open_delay_enabled;
-- ALTER TABLE public.widgets DROP COLUMN IF EXISTS open_delay_seconds;
-- ALTER TABLE public.widgets DROP COLUMN IF EXISTS button_animation;
-- ALTER TABLE public.widgets DROP COLUMN IF EXISTS button_subtext;
-- ALTER TABLE public.widgets DROP COLUMN IF EXISTS button_icon_type;
-- ALTER TABLE public.widgets DROP COLUMN IF EXISTS button_icon_value;
-- =============================================================================
