import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadTestEnv } from './guard'
import { randomId, type TenantRecordIds } from './helpers'

export type { TenantRecordIds } from './helpers'

export type TenantFixture = {
  label: 'A' | 'B'
  authUserId: string
  orgId: string
  email: string
  password: string
  client: SupabaseClient
  records: TenantRecordIds
  storagePaths: string[]
}

export type ResourceRegistry = {
  authUserIds: string[]
  orgIds: string[]
  storagePaths: string[]
}

export type TestHarness = {
  service: SupabaseClient
  anon: SupabaseClient
  tenantA: TenantFixture
  tenantB: TenantFixture
  runId: string
  cleanup: () => Promise<void>
}

function trackAuthUser(registry: ResourceRegistry, authUserId: string): void {
  if (!registry.authUserIds.includes(authUserId)) {
    registry.authUserIds.push(authUserId)
  }
}

function trackOrg(registry: ResourceRegistry, orgId: string): void {
  if (!registry.orgIds.includes(orgId)) {
    registry.orgIds.push(orgId)
  }
}

function recordCleanupError(errors: string[], step: string, error: { message: string } | null): void {
  if (error) {
    errors.push(`${step}: ${error.message}`)
  }
}

export async function cleanupRegistry(
  service: SupabaseClient,
  registry: ResourceRegistry
): Promise<void> {
  const errors: string[] = []

  for (const path of registry.storagePaths) {
    const { error } = await service.storage.from('provider-images').remove([path])
    recordCleanupError(errors, `storage remove ${path}`, error)
  }

  for (const orgId of registry.orgIds) {
    const { data: providers, error: providersSelectError } = await service
      .from('providers')
      .select('id')
      .eq('org_id', orgId)

    recordCleanupError(errors, `select providers for org ${orgId}`, providersSelectError)

    const providerIds = (providers ?? []).map((row) => row.id as string)
    if (providerIds.length > 0) {
      const { error } = await service.from('provider_locations').delete().in('provider_id', providerIds)
      recordCleanupError(errors, `delete provider_locations for org ${orgId}`, error)
    }

    const tables = [
      'widget_session_events',
      'widget_sessions',
      'offerings',
      'questions',
      'widgets',
      'import_history',
      'providers',
      'locations',
      'case_types',
      'categories',
      'constraints',
      'users',
    ] as const

    for (const table of tables) {
      const column = table === 'users' ? 'org_id' : 'org_id'
      const { error } = await service.from(table).delete().eq(column, orgId)
      recordCleanupError(errors, `delete ${table} for org ${orgId}`, error)
    }

    const { error: orgDeleteError } = await service.from('organizations').delete().eq('id', orgId)
    recordCleanupError(errors, `delete organization ${orgId}`, orgDeleteError)
  }

  for (const authUserId of registry.authUserIds) {
    const { error } = await service.auth.admin.deleteUser(authUserId)
    recordCleanupError(errors, `delete auth user ${authUserId}`, error)
  }

  if (errors.length > 0) {
    throw new Error(`Cleanup incomplete:\n${errors.join('\n')}`)
  }
}

async function signInTenant(
  url: string,
  anonKey: string,
  email: string,
  password: string
): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(`Failed to sign in test tenant (${email}): ${error.message}`)
  }

  return client
}

async function seedMinimalTenantData(
  client: SupabaseClient,
  orgId: string,
  label: 'A' | 'B'
): Promise<Pick<TenantRecordIds, 'location' | 'provider' | 'widget'>> {
  const { data: location, error: locationError } = await client
    .from('locations')
    .insert({ org_id: orgId, name: `RLS Test Location ${label}` })
    .select('id')
    .single()

  if (locationError || !location) {
    throw new Error(`Failed to seed location for tenant ${label}: ${locationError?.message}`)
  }

  const { data: provider, error: providerError } = await client
    .from('providers')
    .insert({
      org_id: orgId,
      name: `RLS Test Provider ${label}`,
      normalized_name: `rls test provider ${label}`,
      category_ids: [],
    })
    .select('id')
    .single()

  if (providerError || !provider) {
    throw new Error(`Failed to seed provider for tenant ${label}: ${providerError?.message}`)
  }

  const { data: widget, error: widgetError } = await client
    .from('widgets')
    .insert({
      org_id: orgId,
      name: `RLS Test Widget ${label}`,
      status: 'draft',
      primary_color: '#000000',
      button_text: 'Start',
      greeting_text: 'Hello',
      scoped_provider_ids: [],
      scoped_case_type_ids: [],
      scoped_location_ids: [],
      scoped_question_ids: [],
      question_order: [],
    })
    .select('id')
    .single()

  if (widgetError || !widget) {
    throw new Error(`Failed to seed widget for tenant ${label}: ${widgetError?.message}`)
  }

  return {
    location: location.id as string,
    provider: provider.id as string,
    widget: widget.id as string,
  }
}

async function seedFullTenantBRecords(
  service: SupabaseClient,
  client: SupabaseClient,
  orgId: string,
  authUserId: string,
  minimal: Pick<TenantRecordIds, 'location' | 'provider' | 'widget'>
): Promise<TenantRecordIds> {
  const { data: caseType, error: caseTypeError } = await client
    .from('case_types')
    .insert({ org_id: orgId, name: 'RLS Test Case Type B' })
    .select('id')
    .single()

  if (caseTypeError || !caseType) {
    throw new Error(`Failed to seed case type for tenant B: ${caseTypeError?.message}`)
  }

  const { data: category, error: categoryError } = await client
    .from('categories')
    .insert({ org_id: orgId, name: 'RLS Test Category B' })
    .select('id')
    .single()

  if (categoryError || !category) {
    throw new Error(`Failed to seed category for tenant B: ${categoryError?.message}`)
  }

  const { data: providerLocation, error: providerLocationError } = await client
    .from('provider_locations')
    .insert({
      provider_id: minimal.provider,
      location_id: minimal.location,
      phone: '555-0001',
    })
    .select('id')
    .single()

  if (providerLocationError || !providerLocation) {
    throw new Error(`Failed to seed provider_location for tenant B: ${providerLocationError?.message}`)
  }

  const { data: constraint, error: constraintError } = await client
    .from('constraints')
    .insert({
      org_id: orgId,
      name: 'RLS Test Constraint B',
      type: 'binary',
      mapped_key: 'rls_test_constraint_b',
      yes_label: 'Yes',
      no_label: 'No',
      yes_maps_to: '1',
      no_maps_to: '0',
      sort_order: 0,
    })
    .select('id')
    .single()

  if (constraintError || !constraint) {
    throw new Error(`Failed to seed constraint for tenant B: ${constraintError?.message}`)
  }

  const { data: question, error: questionError } = await client
    .from('questions')
    .insert({
      org_id: orgId,
      question_text: 'RLS Test Question B',
      question_type: 'entry',
      input_type: 'buttons',
      order_rank: 1,
      required: false,
      constraint_id: constraint.id,
    })
    .select('id')
    .single()

  if (questionError || !question) {
    throw new Error(`Failed to seed question for tenant B: ${questionError?.message}`)
  }

  const { data: offering, error: offeringError } = await client
    .from('offerings')
    .insert({
      org_id: orgId,
      provider_id: minimal.provider,
      case_type_id: caseType.id,
      location_ids: [minimal.location],
      constraints: {},
    })
    .select('id')
    .single()

  if (offeringError || !offering) {
    throw new Error(`Failed to seed offering for tenant B: ${offeringError?.message}`)
  }

  const { data: importHistory, error: importHistoryError } = await client
    .from('import_history')
    .insert({
      org_id: orgId,
      filename: 'rls-test-b.csv',
      rows_processed: 1,
    })
    .select('id')
    .single()

  if (importHistoryError || !importHistory) {
    throw new Error(`Failed to seed import_history for tenant B: ${importHistoryError?.message}`)
  }

  const widgetSessionKey = `rls-test-session-b-${randomId()}`
  const { data: widgetSession, error: widgetSessionError } = await service
    .from('widget_sessions')
    .insert({
      widget_id: minimal.widget,
      org_id: orgId,
      session_id: widgetSessionKey,
      zero_results: false,
      answers: {},
      providers_clicked: [],
      providers_shown: [],
    })
    .select('id')
    .single()

  if (widgetSessionError || !widgetSession) {
    throw new Error(`Failed to seed widget_session for tenant B: ${widgetSessionError?.message}`)
  }

  const { data: widgetSessionEvent, error: widgetSessionEventError } = await service
    .from('widget_session_events')
    .insert({
      widget_id: minimal.widget,
      org_id: orgId,
      session_id: widgetSessionKey,
      event_type: 'seed',
    })
    .select('id')
    .single()

  if (widgetSessionEventError || !widgetSessionEvent) {
    throw new Error(`Failed to seed widget_session_event for tenant B: ${widgetSessionEventError?.message}`)
  }

  return {
    organization: orgId,
    user: authUserId,
    location: minimal.location,
    caseType: caseType.id as string,
    category: category.id as string,
    provider: minimal.provider,
    providerLocation: providerLocation.id as string,
    constraint: constraint.id as string,
    offering: offering.id as string,
    question: question.id as string,
    widget: minimal.widget,
    importHistory: importHistory.id as string,
    widgetSession: widgetSession.id as string,
    widgetSessionEvent: widgetSessionEvent.id as string,
    widgetSessionKey,
  }
}

async function createTenant(
  service: SupabaseClient,
  url: string,
  anonKey: string,
  runId: string,
  label: 'A' | 'B',
  registry: ResourceRegistry,
  fullSeed: boolean
): Promise<TenantFixture> {
  const email = `tenant-isolation-${label.toLowerCase()}-${runId}@example.invalid`
  const password = `Test-${randomId()}-Aa1!`

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user for tenant ${label}: ${authError?.message}`)
  }

  const authUserId = authData.user.id
  trackAuthUser(registry, authUserId)

  const { data: org, error: orgError } = await service
    .from('organizations')
    .insert({ name: `RLS Test Org ${label} ${runId}` })
    .select('id')
    .single()

  if (orgError || !org) {
    throw new Error(`Failed to create organization for tenant ${label}: ${orgError?.message}`)
  }

  const orgId = org.id as string
  trackOrg(registry, orgId)

  const { error: userError } = await service.from('users').insert({
    id: authUserId,
    org_id: orgId,
    name: `RLS Test User ${label}`,
    email,
    role: 'owner',
  })

  if (userError) {
    throw new Error(`Failed to create users row for tenant ${label}: ${userError.message}`)
  }

  const client = await signInTenant(url, anonKey, email, password)
  const minimal = await seedMinimalTenantData(client, orgId, label)

  const records: TenantRecordIds = fullSeed
    ? await seedFullTenantBRecords(service, client, orgId, authUserId, minimal)
    : {
        organization: orgId,
        user: authUserId,
        location: minimal.location,
        caseType: '',
        category: '',
        provider: minimal.provider,
        providerLocation: '',
        constraint: '',
        offering: '',
        question: '',
        widget: minimal.widget,
        importHistory: '',
        widgetSession: '',
        widgetSessionEvent: '',
        widgetSessionKey: '',
      }

  return {
    label,
    authUserId,
    orgId,
    email,
    password,
    client,
    records,
    storagePaths: [],
  }
}

export async function createTestHarness(): Promise<TestHarness> {
  const { url, anonKey, serviceRoleKey } = loadTestEnv()
  const runId = randomId().slice(0, 8)
  const registry: ResourceRegistry = {
    authUserIds: [],
    orgIds: [],
    storagePaths: [],
  }

  const service = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let tenantA: TenantFixture | null = null
  let tenantB: TenantFixture | null = null

  try {
    tenantA = await createTenant(service, url, anonKey, runId, 'A', registry, false)
    tenantB = await createTenant(service, url, anonKey, runId, 'B', registry, true)

    const cleanup = async () => {
      const paths = [...tenantA!.storagePaths, ...tenantB!.storagePaths]
      for (const path of paths) {
        if (!registry.storagePaths.includes(path)) {
          registry.storagePaths.push(path)
        }
      }
      await cleanupRegistry(service, registry)
    }

    return { service, anon, tenantA, tenantB, runId, cleanup }
  } catch (error) {
    try {
      await cleanupRegistry(service, registry)
    } catch {
      // Preserve the original setup error when partial cleanup also fails.
    }
    throw error
  }
}
