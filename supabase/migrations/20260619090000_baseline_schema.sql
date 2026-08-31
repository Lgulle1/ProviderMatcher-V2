-- Reconstructed baseline for the application schema that predates this
-- repository's migration history. Definitions are idempotent so applying this
-- newly tracked, earlier migration to the existing linked project is a no-op;
-- a fresh project receives the tables required by every later migration.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  fallback_phone text,
  fallback_message text DEFAULT 'We couldn''t find a match for your criteria. Please call us for assistance.',
  allowed_domains text[] DEFAULT '{}'::text[],
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  default_booking_mode text DEFAULT 'simple',
  default_phone_mode text DEFAULT 'simple'
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text,
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  directions_url text,
  sort_order integer DEFAULT 0,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.case_types (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.constraints (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('binary', 'range', 'exact')),
  mapped_key text NOT NULL,
  secondary_mapped_key text,
  min_allowed_value numeric,
  max_allowed_value numeric,
  yes_label text DEFAULT 'Yes',
  no_label text DEFAULT 'No',
  yes_maps_to text DEFAULT 'both' CHECK (yes_maps_to IN ('0', '1', 'both')),
  no_maps_to text DEFAULT '0' CHECK (no_maps_to IN ('0', '1', 'both')),
  sort_order integer DEFAULT 0,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, mapped_key)
);

CREATE TABLE IF NOT EXISTS public.providers (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text,
  npi text,
  email text,
  subtitle text,
  bio_link text,
  image_url text,
  category_ids uuid[] DEFAULT '{}'::uuid[],
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  booking_mode text DEFAULT 'default',
  phone_mode text DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS public.provider_locations (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  booking_link text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  phone text,
  bio_link text,
  UNIQUE (provider_id, location_id)
);

CREATE TABLE IF NOT EXISTS public.offerings (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  case_type_id uuid NOT NULL REFERENCES public.case_types(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_ids uuid[] DEFAULT '{}'::uuid[],
  constraints jsonb DEFAULT '{}'::jsonb,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider_id, case_type_id)
);

CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  subtext text,
  question_type text NOT NULL DEFAULT 'clinical'
    CHECK (question_type IN ('entry', 'clinical', 'location', 'provider')),
  input_type text NOT NULL DEFAULT 'buttons'
    CHECK (input_type IN ('buttons', 'dropdown', 'number')),
  constraint_id uuid REFERENCES public.constraints(id) ON DELETE SET NULL,
  required boolean DEFAULT true,
  order_rank integer DEFAULT 0,
  system_config jsonb DEFAULT '{}'::jsonb,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.widgets (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  primary_color text DEFAULT '#3B82F6',
  button_text text DEFAULT 'Find a Provider',
  greeting_text text DEFAULT 'Let''s find the right specialist for you.',
  disclaimer_text text,
  fallback_message text,
  show_worth_the_drive boolean DEFAULT true,
  embed_mode text DEFAULT 'floating' CHECK (embed_mode IN ('floating', 'inline')),
  scoped_provider_ids uuid[] DEFAULT '{}'::uuid[],
  scoped_case_type_ids uuid[] DEFAULT '{}'::uuid[],
  scoped_location_ids uuid[] DEFAULT '{}'::uuid[],
  scoped_question_ids uuid[] DEFAULT '{}'::uuid[],
  question_order jsonb DEFAULT '[]'::jsonb,
  published_at timestamptz,
  published_snapshot jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.import_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  filename text,
  rows_processed integer DEFAULT 0,
  providers_created integer DEFAULT 0,
  providers_updated integer DEFAULT 0,
  duplicates_detected integer DEFAULT 0,
  errors integer DEFAULT 0,
  mapping_template jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.widget_sessions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  widget_id uuid REFERENCES public.widgets(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  case_type_id uuid,
  answers jsonb DEFAULT '{}'::jsonb,
  results_count integer,
  zero_results boolean DEFAULT false,
  providers_clicked uuid[] DEFAULT '{}'::uuid[],
  created_at timestamptz DEFAULT now(),
  org_id uuid REFERENCES public.organizations(id),
  providers_shown text[] NOT NULL DEFAULT '{}'::text[],
  providers_shown_source text NOT NULL DEFAULT 'live'
);

CREATE TABLE IF NOT EXISTS public.widget_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  widget_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_type text NOT NULL,
  step_index integer,
  question_id uuid,
  question_text text,
  created_at timestamptz DEFAULT now(),
  answer_text text
);

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $updated_at_triggers$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'organizations', 'users', 'locations', 'case_types', 'categories',
    'constraints', 'providers', 'provider_locations', 'offerings',
    'questions', 'widgets'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || v_table || '_updated_at', v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()',
      'trg_' || v_table || '_updated_at',
      v_table
    );
  END LOOP;
END;
$updated_at_triggers$;

-- This baseline is intentionally schema-only. Seed/reference data belongs in
-- explicit seed files; tenant or patient data must never be committed.
