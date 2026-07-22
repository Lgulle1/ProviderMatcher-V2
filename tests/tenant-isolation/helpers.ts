import { expect } from 'vitest'

export type TenantRecordIds = {
  organization: string
  user: string
  location: string
  caseType: string
  category: string
  provider: string
  providerLocation: string
  constraint: string
  offering: string
  question: string
  widget: string
  importHistory: string
  widgetSession: string
  widgetSessionEvent: string
  widgetSessionKey: string
}

/** Public application tables protected by tenant RLS (excludes storage). */
export const APPLICATION_TABLES = [
  'organizations',
  'users',
  'locations',
  'case_types',
  'categories',
  'providers',
  'provider_locations',
  'constraints',
  'offerings',
  'questions',
  'widgets',
  'import_history',
  'widget_sessions',
  'widget_session_events',
] as const

export type ApplicationTable = (typeof APPLICATION_TABLES)[number]

export type TableProbe = {
  table: ApplicationTable
  column: string
  value: string
}

export type SupabaseErrorLike = {
  code?: string
  message?: string
} | null

export function isRlsDenied(error: SupabaseErrorLike): boolean {
  if (!error) {
    return false
  }

  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('violates row-level security policy')
  )
}

export function expectDeniedRead(rows: unknown[] | null): void {
  expect(rows ?? []).toEqual([])
}

export function expectDeniedWrite(error: SupabaseErrorLike): void {
  expect(isRlsDenied(error)).toBe(true)
}

export function recordProbes(records: TenantRecordIds): TableProbe[] {
  return [
    { table: 'organizations', column: 'id', value: records.organization },
    { table: 'users', column: 'id', value: records.user },
    { table: 'locations', column: 'id', value: records.location },
    { table: 'case_types', column: 'id', value: records.caseType },
    { table: 'categories', column: 'id', value: records.category },
    { table: 'providers', column: 'id', value: records.provider },
    { table: 'provider_locations', column: 'id', value: records.providerLocation },
    { table: 'constraints', column: 'id', value: records.constraint },
    { table: 'offerings', column: 'id', value: records.offering },
    { table: 'questions', column: 'id', value: records.question },
    { table: 'widgets', column: 'id', value: records.widget },
    { table: 'import_history', column: 'id', value: records.importHistory },
    { table: 'widget_sessions', column: 'id', value: records.widgetSession },
    { table: 'widget_session_events', column: 'id', value: records.widgetSessionEvent },
  ]
}

export function anonInsertPayloads(
  records: TenantRecordIds,
  forgedOrgId: string,
  randomUserId: string
): Record<ApplicationTable, Record<string, unknown>> {
  return {
    organizations: { name: 'Anon Org Probe' },
    users: {
      id: randomUserId,
      org_id: forgedOrgId,
      email: `anon-${randomUserId}@example.invalid`,
      name: 'Anon',
    },
    locations: { org_id: forgedOrgId, name: 'Anon Location' },
    case_types: { org_id: forgedOrgId, name: 'Anon Case Type' },
    categories: { org_id: forgedOrgId, name: 'Anon Category' },
    providers: {
      org_id: forgedOrgId,
      name: 'Anon Provider',
      normalized_name: 'anon provider',
      category_ids: [records.category],
    },
    provider_locations: {
      provider_id: records.provider,
      location_id: records.location,
    },
    constraints: {
      org_id: forgedOrgId,
      name: 'Anon Constraint',
      type: 'binary',
      mapped_key: 'probe',
      yes_label: 'Yes',
      no_label: 'No',
      yes_maps_to: '1',
      no_maps_to: '0',
      sort_order: 0,
    },
    offerings: {
      org_id: forgedOrgId,
      provider_id: records.provider,
      case_type_id: records.caseType,
      location_ids: [records.location],
      constraints: {},
    },
    questions: {
      org_id: forgedOrgId,
      question_text: 'Anon?',
      question_type: 'entry',
      input_type: 'buttons',
      order_rank: 1,
      required: false,
      constraint_id: records.constraint,
    },
    widgets: {
      org_id: forgedOrgId,
      name: 'Anon Widget',
      status: 'draft',
      primary_color: '#000000',
      button_text: 'Go',
      greeting_text: 'Hi',
      scoped_provider_ids: [records.provider],
      scoped_case_type_ids: [records.caseType],
      scoped_location_ids: [records.location],
      scoped_question_ids: [records.question],
      question_order: [],
    },
    import_history: { org_id: forgedOrgId, rows_processed: 0 },
    widget_sessions: {
      org_id: forgedOrgId,
      widget_id: records.widget,
      session_id: `anon-session-${randomUserId}`,
      zero_results: false,
      answers: {},
      providers_clicked: [],
      providers_shown: [],
    },
    widget_session_events: {
      org_id: forgedOrgId,
      widget_id: records.widget,
      session_id: `anon-session-${randomUserId}`,
      event_type: 'probe',
    },
  }
}

export function anonUpdatePayload(table: ApplicationTable): Record<string, unknown> {
  switch (table) {
    case 'organizations':
      return { name: 'Anon Org Update' }
    case 'users':
      return { name: 'Anon User Update' }
    case 'locations':
      return { name: 'Anon Location Update' }
    case 'case_types':
      return { name: 'Anon Case Type Update' }
    case 'categories':
      return { name: 'Anon Category Update' }
    case 'providers':
      return { name: 'Anon Provider Update' }
    case 'provider_locations':
      return { phone: '555-0100' }
    case 'constraints':
      return { name: 'Anon Constraint Update' }
    case 'offerings':
      return { constraints: { probe: true } }
    case 'questions':
      return { question_text: 'Anon Question Update' }
    case 'widgets':
      return { name: 'Anon Widget Update' }
    case 'import_history':
      return { rows_processed: 1 }
    case 'widget_sessions':
      return { zero_results: true }
    case 'widget_session_events':
      return { event_type: 'anon-update' }
    default:
      return {}
  }
}

/** Minimal 1x1 PNG (valid header) for storage upload probes. */
export const TINY_PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

export function randomId(): string {
  return crypto.randomUUID()
}
