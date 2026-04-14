export interface Organization {
  id: string
  name: string
  fallback_phone: string | null
  fallback_message: string
  allowed_domains: string[]
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  org_id: string
  name: string | null
  email: string
  created_at: string
  updated_at: string
}

export interface Location {
  id: string
  org_id: string
  name: string
  address: string | null
  phone: string | null
  directions_url: string | null
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface CaseType {
  id: string
  org_id: string
  name: string
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  org_id: string
  name: string
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Provider {
  id: string
  org_id: string
  name: string
  normalized_name: string | null
  npi: string | null
  email: string | null
  subtitle: string | null
  bio_link: string | null
  image_url: string | null
  category_ids: string[]
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface ProviderLocation {
  id: string
  provider_id: string
  location_id: string
  booking_link: string | null
  created_at: string
  updated_at: string
}

export interface Constraint {
  id: string
  org_id: string
  name: string
  type: 'binary' | 'range' | 'exact'
  mapped_key: string
  secondary_mapped_key: string | null
  min_allowed_value: number | null
  max_allowed_value: number | null
  yes_label: string
  no_label: string
  yes_maps_to: '0' | '1' | 'both'
  no_maps_to: '0' | '1' | 'both'
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Offering {
  id: string
  provider_id: string
  case_type_id: string
  org_id: string
  location_ids: string[]
  constraints: Record<string, any>
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Question {
  id: string
  org_id: string
  question_text: string
  subtext: string | null
  question_type: 'entry' | 'clinical' | 'location' | 'provider'
  input_type: 'buttons' | 'dropdown' | 'number'
  constraint_id: string | null
  required: boolean
  order_rank: number
  system_config: Record<string, any>
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Widget {
  id: string
  org_id: string
  name: string
  status: 'draft' | 'live' | 'archived'
  primary_color: string
  button_text: string
  greeting_text: string
  disclaimer_text: string | null
  fallback_message: string | null
  show_worth_the_drive: boolean
  embed_mode: 'floating' | 'inline'
  scoped_provider_ids: string[]
  scoped_case_type_ids: string[]
  scoped_location_ids: string[]
  scoped_question_ids: string[]
  question_order: any[]
  published_at: string | null
  published_snapshot: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface ImportHistory {
  id: string
  org_id: string
  filename: string | null
  rows_processed: number
  providers_created: number
  providers_updated: number
  duplicates_detected: number
  errors: number
  mapping_template: Record<string, any> | null
  created_at: string
}

export interface WidgetSession {
  id: string
  widget_id: string | null
  session_id: string
  case_type_id: string | null
  answers: Record<string, any>
  results_count: number | null
  zero_results: boolean
  providers_clicked: string[]
  created_at: string
}
