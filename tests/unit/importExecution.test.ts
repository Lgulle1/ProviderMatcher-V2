import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Provider } from '../../src/types/database'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc } }))

import { detectConflicts, executeImportRun } from '../../src/lib/import/importExecution'

const provider = (over: Partial<Provider> = {}): Provider => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  org_id: 'org1',
  name: 'Dr. Jane Smith',
  normalized_name: 'dr jane smith',
  npi: null,
  email: null,
  subtitle: null,
  bio_link: null,
  image_url: null,
  category_ids: [],
  booking_mode: 'default',
  phone_mode: 'default',
  is_archived: false,
  created_at: '',
  updated_at: '',
  ...over,
})

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({
    data: {
      providersCreated: 1,
      providersUpdated: 0,
      offeringsUpserted: 1,
      newCaseTypesCount: 0,
      newCategoriesCount: 0,
    },
    error: null,
  })
})

describe('detectConflicts', () => {
  it('matches normalized names and reports the source row', () => {
    const conflicts = detectConflicts(
      [{ Provider: 'Someone Else' }, { Provider: 'DR. JANE SMITH' }],
      'Provider',
      [provider()],
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ rowIndex: 1, matchType: 'exact' })
  })

  it('ignores punctuation and spacing differences', () => {
    const conflicts = detectConflicts(
      [{ Provider: "Dr.  O'Brien,  MD" }],
      'Provider',
      [provider({ name: 'Dr OBrien MD', normalized_name: 'dr obrien md' })],
    )
    expect(conflicts[0]?.matchType).toBe('exact')
  })

  it('flags a close fuzzy match but not a different person', () => {
    expect(detectConflicts(
      [{ Provider: 'Dr Jane Smyth' }],
      'Provider',
      [provider()],
    )[0]?.matchType).toBe('fuzzy')
    expect(detectConflicts(
      [{ Provider: 'Dr Aaron Fields' }],
      'Provider',
      [provider()],
    )).toHaveLength(0)
  })

  it('skips blank provider cells', () => {
    expect(detectConflicts([{ Provider: '   ' }], 'Provider', [provider()])).toHaveLength(0)
  })
})

describe('executeImportRun', () => {
  const base = {
    orgId: 'org1',
    filename: 'providers.xlsx',
    headers: ['Provider', 'Case Type'],
    rows: [{ Provider: 'Dr. New Person', 'Case Type': 'Knee' }],
    mappings: [
      { excelHeader: 'Provider', role: 'provider_name' },
      { excelHeader: 'Case Type', role: 'case_type' },
    ],
    orgConstraints: [],
    orgCaseTypes: [],
    orgCategories: [],
    conflicts: [],
    resolvedConflicts: {},
  }

  it('submits one tenant-derived transactional RPC instead of browser writes', async () => {
    const result = await executeImportRun(base)
    expect(result.providersCreated).toBe(1)
    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('execute_provider_import')
    expect(args.p_payload).not.toHaveProperty('orgId')
    expect(args.p_payload.rows).toEqual(base.rows)
  })

  it('sends only row index and controlled provider id for conflicts', async () => {
    const existing = provider()
    await executeImportRun({
      ...base,
      conflicts: [{
        rowIndex: 0,
        incomingName: existing.name,
        existingProvider: existing,
        matchType: 'exact' as const,
      }],
      resolvedConflicts: { '0': 'merge' },
    })
    expect(rpc.mock.calls[0][1].p_payload.conflicts).toEqual([{
      rowIndex: 0,
      existingProviderId: existing.id,
    }])
  })

  it('surfaces transaction failures and rejects malformed results', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'rolled back' } })
    await expect(executeImportRun(base)).rejects.toThrow('rolled back')

    rpc.mockResolvedValueOnce({ data: { providersCreated: -1 }, error: null })
    await expect(executeImportRun(base)).rejects.toThrow('invalid result')
  })

  it('keeps the database function tenant-derived, bounded, and atomic', () => {
    const sql = readFileSync(
      'supabase/migrations/20260825111500_transactional_provider_import.sql',
      'utf8',
    )
    expect(sql).toContain('provider_matcher_private.get_user_org_id()')
    expect(sql).toContain('jsonb_array_length(v_rows) > 25000')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.execute_provider_import(jsonb) TO authenticated')
    expect(sql).not.toContain('p_org_id')
  })
})
