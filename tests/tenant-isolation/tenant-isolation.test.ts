import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestHarness, type TestHarness } from './fixtures'
import {
  anonInsertPayloads,
  anonUpdatePayload,
  APPLICATION_TABLES,
  expectDeniedRead,
  expectDeniedWrite,
  isRlsDenied,
  randomId,
  recordProbes,
  TINY_PNG_BYTES,
} from './helpers'

let harness: TestHarness

function importPayload(providerName: string, caseType: string, extra: Record<string, unknown> = {}) {
  return {
    filename: 'tenant-integration.xlsx',
    headers: ['Provider', 'Case Type'],
    mappings: [
      { excelHeader: 'Provider', role: 'provider_name' },
      { excelHeader: 'Case Type', role: 'case_type' },
    ],
    rows: [{ Provider: providerName, 'Case Type': caseType }],
    conflicts: [],
    resolvedConflicts: {},
    ...extra,
  }
}

beforeAll(async () => {
  harness = await createTestHarness()
}, 120_000)

afterAll(async () => {
  if (harness) {
    await harness.cleanup()
  }
}, 120_000)

describe('tenant isolation (staging Supabase RLS)', () => {
  describe('1. anonymous access is denied', () => {
    it('denies anonymous SELECT on every seeded tenant B table', async () => {
      const { anon, tenantB } = harness

      for (const probe of recordProbes(tenantB.records)) {
        const { data, error } = await anon
          .from(probe.table)
          .select('id')
          .eq(probe.column, probe.value)

        expect(error).toBeNull()
        expectDeniedRead(data)
      }
    })

    it('denies anonymous INSERT on every application table with RLS errors', async () => {
      const { anon, tenantB } = harness
      const randomUserId = randomId()
      const payloads = anonInsertPayloads(tenantB.records, tenantB.orgId, randomUserId)

      for (const table of APPLICATION_TABLES) {
        const { error } = await anon.from(table).insert(payloads[table])
        expectDeniedWrite(error)
      }
    })

    it('denies anonymous UPDATE on every seeded tenant B table', async () => {
      const { anon, tenantB, service } = harness

      for (const probe of recordProbes(tenantB.records)) {
        const { data, error } = await anon
          .from(probe.table)
          .update(anonUpdatePayload(probe.table))
          .eq(probe.column, probe.value)
          .select('id')

        if (error) {
          expectDeniedWrite(error)
        } else {
          expectDeniedRead(data)
        }

        const { data: unchanged, error: verifyError } = await service
          .from(probe.table)
          .select('id')
          .eq(probe.column, probe.value)
          .maybeSingle()

        expect(verifyError).toBeNull()
        expect(unchanged?.id).toBe(probe.value)
      }
    })

    it('denies anonymous DELETE on every seeded tenant B table', async () => {
      const { anon, tenantB, service } = harness

      for (const probe of recordProbes(tenantB.records)) {
        const { data, error } = await anon
          .from(probe.table)
          .delete()
          .eq(probe.column, probe.value)
          .select('id')

        if (error) {
          expectDeniedWrite(error)
        } else {
          expectDeniedRead(data)
        }

        const { data: stillThere, error: verifyError } = await service
          .from(probe.table)
          .select('id')
          .eq(probe.column, probe.value)
          .maybeSingle()

        expect(verifyError).toBeNull()
        expect(stillThere?.id).toBe(probe.value)
      }
    })
  })

  describe('2. cross-tenant access is denied', () => {
    it('prevents tenant A from inserting into tenant B org or users table', async () => {
      const { tenantA, tenantB } = harness

      const { error: userInsertError } = await tenantA.client.from('users').insert({
        id: randomId(),
        org_id: tenantA.orgId,
        email: `blocked-${randomId()}@example.invalid`,
        name: 'Blocked',
      })

      expectDeniedWrite(userInsertError)

      const { error: crossOrgLocationError } = await tenantA.client.from('locations').insert({
        org_id: tenantB.orgId,
        name: 'Cross insert',
      })

      expectDeniedWrite(crossOrgLocationError)
    })

    it('prevents tenant A from updating or deleting tenant B records', async () => {
      const { tenantA, tenantB, service } = harness

      const { data: updated, error: updateError } = await tenantA.client
        .from('locations')
        .update({ name: 'Cross-tenant hijack' })
        .eq('id', tenantB.records.location)
        .select('id')

      expect(updateError).toBeNull()
      expectDeniedRead(updated)

      const { data: deleted, error: deleteError } = await tenantA.client
        .from('locations')
        .delete()
        .eq('id', tenantB.records.location)
        .select('id')

      expect(deleteError).toBeNull()
      expectDeniedRead(deleted)

      const { data: stillThere } = await service
        .from('locations')
        .select('name')
        .eq('id', tenantB.records.location)
        .single()

      expect(stillThere?.name).toContain('RLS Test Location B')
    })
  })

  describe('3. forged org_id writes are denied', () => {
    it('rejects INSERT with another tenant org_id', async () => {
      const { tenantA, tenantB } = harness

      const { error } = await tenantA.client.from('locations').insert({
        org_id: tenantB.orgId,
        name: 'Forged org insert',
      })

      expectDeniedWrite(error)
    })

    it('rejects UPDATE that moves a row into another org', async () => {
      const { tenantA, tenantB } = harness

      const { data, error } = await tenantA.client
        .from('locations')
        .update({ org_id: tenantB.orgId })
        .eq('id', tenantA.records.location)
        .select('org_id')

      expect(error).toBeNull()
      expectDeniedRead(data)

      const { data: unchanged } = await tenantA.client
        .from('locations')
        .select('org_id')
        .eq('id', tenantA.records.location)
        .single()

      expect(unchanged?.org_id).toBe(tenantA.orgId)
    })
  })

  describe('4. known tenant B IDs do not bypass RLS for tenant A', () => {
    it('returns no rows when tenant A queries tenant B record IDs', async () => {
      const { tenantA, tenantB } = harness

      for (const probe of recordProbes(tenantB.records)) {
        const { data, error } = await tenantA.client
          .from(probe.table)
          .select('id')
          .eq(probe.column, probe.value)

        expect(error).toBeNull()
        expectDeniedRead(data)
      }
    })
  })

  describe('5. provider image uploads respect org folders', () => {
    it('denies upload outside the authenticated user org folder', async () => {
      const { tenantA, tenantB } = harness
      const foreignPath = `${tenantB.orgId}/cross-tenant-probe.png`

      const { error } = await tenantA.client.storage
        .from('provider-images')
        .upload(foreignPath, TINY_PNG_BYTES, {
          contentType: 'image/png',
          upsert: true,
        })

      expect(error).not.toBeNull()
      expect(isRlsDenied(error)).toBe(true)
    })

    it('allows upload inside the authenticated user org folder', async () => {
      const { tenantA } = harness
      const ownPath = `${tenantA.orgId}/rls-probe-${randomId()}.png`

      const { error } = await tenantA.client.storage
        .from('provider-images')
        .upload(ownPath, TINY_PNG_BYTES, {
          contentType: 'image/png',
          upsert: true,
        })

      expect(error).toBeNull()
      tenantA.storagePaths.push(ownPath)
    })
  })

  describe('6. same-organization CRUD succeeds', () => {
    it('supports create, read, update, and delete within the tenant org', async () => {
      const { tenantA } = harness

      const { data: created, error: createError } = await tenantA.client
        .from('case_types')
        .insert({ org_id: tenantA.orgId, name: 'Same-org case type' })
        .select('id, name')
        .single()

      expect(createError).toBeNull()
      expect(created?.id).toBeTruthy()

      const { data: readBack, error: readError } = await tenantA.client
        .from('case_types')
        .select('id, name')
        .eq('id', created!.id)
        .single()

      expect(readError).toBeNull()
      expect(readBack?.name).toBe('Same-org case type')

      const { data: updated, error: updateError } = await tenantA.client
        .from('case_types')
        .update({ name: 'Same-org case type updated' })
        .eq('id', created!.id)
        .select('name')
        .single()

      expect(updateError).toBeNull()
      expect(updated?.name).toBe('Same-org case type updated')

      const { error: deleteError } = await tenantA.client
        .from('case_types')
        .delete()
        .eq('id', created!.id)

      expect(deleteError).toBeNull()
    })
  })

  describe('7. user profile immutability', () => {
    it('allows name changes only', async () => {
      const { tenantA, tenantB } = harness

      const { data: before, error: beforeError } = await tenantA.client
        .from('users')
        .select('id, org_id, email, created_at, name')
        .eq('id', tenantA.authUserId)
        .single()

      expect(beforeError).toBeNull()
      expect(before).toBeTruthy()

      const { error: nameError } = await tenantA.client
        .from('users')
        .update({ name: 'Allowed Name Change' })
        .eq('id', tenantA.authUserId)

      expect(nameError).toBeNull()

      const { data: afterName } = await tenantA.client
        .from('users')
        .select('name')
        .eq('id', tenantA.authUserId)
        .single()

      expect(afterName?.name).toBe('Allowed Name Change')

      const immutableAttempts: Array<Record<string, unknown>> = [
        { org_id: tenantB.orgId },
        { email: `hijack-${randomId()}@example.invalid` },
        { created_at: new Date(0).toISOString() },
        { id: randomId() },
      ]

      for (const patch of immutableAttempts) {
        const { error } = await tenantA.client
          .from('users')
          .update(patch)
          .eq('id', tenantA.authUserId)

        expect(error).not.toBeNull()
        expect(isRlsDenied(error)).toBe(true)
      }

      const { data: after } = await tenantA.client
        .from('users')
        .select('id, org_id, email, created_at')
        .eq('id', tenantA.authUserId)
        .single()

      expect(after?.id).toBe(before!.id)
      expect(after?.org_id).toBe(before!.org_id)
      expect(after?.email).toBe(before!.email)
      expect(after?.created_at).toBe(before!.created_at)
    })
  })

  describe('8. analytics tables reject client writes', () => {
    it('denies authenticated INSERT, UPDATE, and DELETE on widget_sessions', async () => {
      const { tenantA, tenantB, service } = harness

      const { error: insertError } = await tenantA.client.from('widget_sessions').insert({
        widget_id: tenantA.records.widget,
        org_id: tenantA.orgId,
        session_id: `client-write-${randomId()}`,
        zero_results: false,
        answers: {},
        providers_clicked: [],
        providers_shown: [],
      })

      expectDeniedWrite(insertError)

      const { data: beforeUpdate } = await service
        .from('widget_sessions')
        .select('id, zero_results')
        .eq('id', tenantB.records.widgetSession)
        .single()

      expect(beforeUpdate?.zero_results).toBe(false)

      const { data: updated, error: updateError } = await tenantB.client
        .from('widget_sessions')
        .update({ zero_results: true })
        .eq('id', tenantB.records.widgetSession)
        .select('id')

      expect(updateError).toBeNull()
      expectDeniedRead(updated)

      const { data: afterUpdate } = await service
        .from('widget_sessions')
        .select('id, zero_results')
        .eq('id', tenantB.records.widgetSession)
        .single()

      expect(afterUpdate?.id).toBe(tenantB.records.widgetSession)
      expect(afterUpdate?.zero_results).toBe(false)

      const { data: deleted, error: deleteError } = await tenantB.client
        .from('widget_sessions')
        .delete()
        .eq('id', tenantB.records.widgetSession)
        .select('id')

      expect(deleteError).toBeNull()
      expectDeniedRead(deleted)

      const { data: afterDelete } = await service
        .from('widget_sessions')
        .select('id')
        .eq('id', tenantB.records.widgetSession)
        .maybeSingle()

      expect(afterDelete?.id).toBe(tenantB.records.widgetSession)
    })

    it('denies authenticated INSERT, UPDATE, and DELETE on widget_session_events', async () => {
      const { tenantA, tenantB, service } = harness

      const { error: insertError } = await tenantA.client.from('widget_session_events').insert({
        widget_id: tenantA.records.widget,
        org_id: tenantA.orgId,
        session_id: `client-write-${randomId()}`,
        event_type: 'probe',
      })

      expectDeniedWrite(insertError)

      const { data: beforeUpdate } = await service
        .from('widget_session_events')
        .select('id, event_type')
        .eq('id', tenantB.records.widgetSessionEvent)
        .single()

      expect(beforeUpdate?.event_type).toBe('seed')

      const { data: updated, error: updateError } = await tenantB.client
        .from('widget_session_events')
        .update({ event_type: 'client-update' })
        .eq('id', tenantB.records.widgetSessionEvent)
        .select('id')

      expect(updateError).toBeNull()
      expectDeniedRead(updated)

      const { data: afterUpdate } = await service
        .from('widget_session_events')
        .select('id, event_type')
        .eq('id', tenantB.records.widgetSessionEvent)
        .single()

      expect(afterUpdate?.id).toBe(tenantB.records.widgetSessionEvent)
      expect(afterUpdate?.event_type).toBe('seed')

      const { data: deleted, error: deleteError } = await tenantB.client
        .from('widget_session_events')
        .delete()
        .eq('id', tenantB.records.widgetSessionEvent)
        .select('id')

      expect(deleteError).toBeNull()
      expectDeniedRead(deleted)

      const { data: afterDelete } = await service
        .from('widget_session_events')
        .select('id')
        .eq('id', tenantB.records.widgetSessionEvent)
        .maybeSingle()

      expect(afterDelete?.id).toBe(tenantB.records.widgetSessionEvent)
    })
  })

  describe('9. database roles are authoritative', () => {
    it('keeps the last owner and rejects viewer configuration writes', async () => {
      const { tenantA, service } = harness

      const { error: lastOwnerError } = await tenantA.client.rpc('set_organization_member_role', {
        p_user_id: tenantA.authUserId,
        p_role: 'viewer',
      })
      expect(lastOwnerError).not.toBeNull()

      const { error: makeViewerError } = await service
        .from('users')
        .update({ role: 'viewer' })
        .eq('id', tenantA.authUserId)
      expect(makeViewerError).toBeNull()

      try {
        const { error: writeError } = await tenantA.client
          .from('case_types')
          .insert({ org_id: tenantA.orgId, name: 'Viewer write probe' })
        expect(writeError).not.toBeNull()

        const { data: readable, error: readError } = await tenantA.client
          .from('providers')
          .select('id')
          .eq('id', tenantA.records.provider)
          .single()
        expect(readError).toBeNull()
        expect(readable?.id).toBe(tenantA.records.provider)

        const { error: importError } = await tenantA.client.rpc(
          'execute_provider_import',
          { p_payload: importPayload('Viewer Import Probe', 'Viewer Case Probe') },
        )
        expect(importError).not.toBeNull()
      } finally {
        await service.from('users').update({ role: 'owner' }).eq('id', tenantA.authUserId)
      }
    })
  })

  describe('10. provider imports are atomic and tenant-bound', () => {
    it('commits a valid import as one tenant-scoped operation', async () => {
      const { tenantA, runId } = harness
      const providerName = `Atomic Provider ${runId}`
      const caseType = `Atomic Case ${runId}`

      const { data, error } = await tenantA.client.rpc('execute_provider_import', {
        p_payload: importPayload(providerName, caseType),
      })
      expect(error).toBeNull()
      expect(data).toMatchObject({ providersCreated: 1, offeringsUpserted: 1 })

      const providerKey = providerName.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
      const { data: provider, error: providerError } = await tenantA.client
        .from('providers')
        .select('id,org_id')
        .eq('normalized_name', providerKey)
        .single()
      expect(providerError).toBeNull()
      expect(provider?.org_id).toBe(tenantA.orgId)

      const { data: history, error: historyError } = await tenantA.client
        .from('import_history')
        .select('rows_processed,providers_created')
        .eq('filename', 'tenant-integration.xlsx')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      expect(historyError).toBeNull()
      expect(history).toMatchObject({ rows_processed: 1, providers_created: 1 })
    })

    it('rolls back earlier inserts when a later relationship is cross-tenant', async () => {
      const { tenantA, tenantB, runId } = harness
      const providerName = `Rollback Provider ${runId}`
      const caseType = `Rollback Case ${runId}`
      const payload = importPayload(providerName, caseType, {
        headers: ['Provider', 'Case Type', 'Foreign Location'],
        mappings: [
          { excelHeader: 'Provider', role: 'provider_name' },
          { excelHeader: 'Case Type', role: 'case_type' },
          { excelHeader: 'Foreign Location', role: 'location', locationId: tenantB.records.location },
        ],
        rows: [{ Provider: providerName, 'Case Type': caseType, 'Foreign Location': 'yes' }],
      })

      const { error } = await tenantA.client.rpc('execute_provider_import', { p_payload: payload })
      expect(error).not.toBeNull()

      const providerKey = providerName.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
      const [{ count: providerCount }, { count: caseCount }] = await Promise.all([
        tenantA.client.from('providers').select('id', { count: 'exact', head: true }).eq('normalized_name', providerKey),
        tenantA.client.from('case_types').select('id', { count: 'exact', head: true }).ilike('name', caseType),
      ])
      expect(providerCount).toBe(0)
      expect(caseCount).toBe(0)
    })

    it('rejects a conflict resolution targeting another tenant provider', async () => {
      const { tenantA, tenantB, runId } = harness
      const payload = importPayload(`Conflict Probe ${runId}`, `Conflict Case ${runId}`, {
        conflicts: [{ rowIndex: 0, existingProviderId: tenantB.records.provider }],
        resolvedConflicts: { 0: 'merge' },
      })
      const { error } = await tenantA.client.rpc('execute_provider_import', { p_payload: payload })
      expect(error).not.toBeNull()
    })
  })
})
