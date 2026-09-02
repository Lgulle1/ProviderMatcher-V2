-- These 13 columns all carry a DEFAULT and the application has always treated
-- them as present: it sorts on sort_order and order_rank, spreads the id arrays,
-- and branches on required. The database never said so, so the generated types
-- correctly reported them as nullable and every reader had to guard a case that
-- does not occur. Declaring the invariant here is cheaper than restating it at
-- 27 call sites, and it stops a future insert from writing the null the app
-- cannot handle.
--
-- Each column is backfilled to the default it already has before the constraint
-- is added, so this is safe whether or not any nulls exist. Tables are small and
-- the rewrite is brief.
--
-- Not included: columns that are genuinely optional (address, phone, npi,
-- subtitle, image_url, privacy_url, published_at, constraint_id, and the rest).
-- A null there means something -- unset -- and the app already handles it.

-- Ordering columns. "Unordered" is position zero, not the absence of a position.
UPDATE public.locations SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE public.locations ALTER COLUMN sort_order SET NOT NULL;

UPDATE public.case_types SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE public.case_types ALTER COLUMN sort_order SET NOT NULL;

UPDATE public.categories SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE public.categories ALTER COLUMN sort_order SET NOT NULL;

UPDATE public.constraints SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE public.constraints ALTER COLUMN sort_order SET NOT NULL;

UPDATE public.questions SET order_rank = 0 WHERE order_rank IS NULL;
ALTER TABLE public.questions ALTER COLUMN order_rank SET NOT NULL;

-- Relationship arrays. "None" is an empty array; a null array is not a state the
-- app can render.
UPDATE public.providers SET category_ids = '{}'::uuid[] WHERE category_ids IS NULL;
ALTER TABLE public.providers ALTER COLUMN category_ids SET NOT NULL;

UPDATE public.offerings SET location_ids = '{}'::uuid[] WHERE location_ids IS NULL;
ALTER TABLE public.offerings ALTER COLUMN location_ids SET NOT NULL;

UPDATE public.widgets SET scoped_provider_ids = '{}'::uuid[] WHERE scoped_provider_ids IS NULL;
ALTER TABLE public.widgets ALTER COLUMN scoped_provider_ids SET NOT NULL;

UPDATE public.widgets SET scoped_case_type_ids = '{}'::uuid[] WHERE scoped_case_type_ids IS NULL;
ALTER TABLE public.widgets ALTER COLUMN scoped_case_type_ids SET NOT NULL;

UPDATE public.widgets SET scoped_location_ids = '{}'::uuid[] WHERE scoped_location_ids IS NULL;
ALTER TABLE public.widgets ALTER COLUMN scoped_location_ids SET NOT NULL;

UPDATE public.widgets SET scoped_question_ids = '{}'::uuid[] WHERE scoped_question_ids IS NULL;
ALTER TABLE public.widgets ALTER COLUMN scoped_question_ids SET NOT NULL;

UPDATE public.widgets SET question_order = '[]'::jsonb WHERE question_order IS NULL;
ALTER TABLE public.widgets ALTER COLUMN question_order SET NOT NULL;

-- A question is required unless it says otherwise, which is what the default
-- already encodes.
UPDATE public.questions SET required = true WHERE required IS NULL;
ALTER TABLE public.questions ALTER COLUMN required SET NOT NULL;

-- ROLLBACK: ALTER COLUMN ... DROP NOT NULL on each column above. The backfilled
-- values stay, which is harmless: they equal the defaults the columns already had.
