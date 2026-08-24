import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaseType, Category, Constraint, Provider } from '../../src/types/database'

/**
 * Covers the import execution path, where a bug corrupts real tenant data
 * rather than just rendering wrong: providers get duplicated, merged into the
 * wrong record, or silently lose fields.
 */

const api = vi.hoisted(() => ({
  createCaseType: vi.fn(),
  createCategory: vi.fn(),
  createProvider: vi.fn(),
  updateProviderCategories: vi.fn(),
}))

/** Records every write so tests can assert on what the import actually sent. */
const db = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; op: string; value: unknown }>,
  /** Rows returned by the offerings lookup, keyed `${provider_id}|${case_type_id}`. */
  existingOfferings: new Map<string, { id: string; constraints: unknown; location_ids: string[] }>(),
}))

vi.mock('../../src/lib/api/caseTypes', () => ({ createCaseType: api.createCaseType }))
vi.mock('../../src/lib/api/categories', () => ({ createCategory: api.createCategory }))
vi.mock('../../src/lib/api/providers', () => ({ createProvider: api.createProvider }))
vi.mock('../../src/lib/api/dataTable', () => ({
  updateProviderCategories: api.updateProviderCategories,
}))

vi.mock('../../src/lib/supabase', () => {
  /** Minimal chainable stand-in for the Supabase query builder. */
  class QueryStub {
    private filters: Record<string, unknown> = {}
    constructor(private table: string) {}
    select() {
      return this
    }
    eq(col: string, val: unknown) {
      this.filters[col] = val
      return this
    }
    maybeSingle() {
      if (this.table === 'offerings') {
        const key = `${this.filters.provider_id}|${this.filters.case_type_id}`
        return Promise.resolve({ data: db.existingOfferings.get(key) ?? null, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }
    upsert(value: unknown) {
      db.writes.push({ table: this.table, op: 'upsert', value })
      return Promise.resolve({ error: null })
    }
    update(value: unknown) {
      db.writes.push({ table: this.table, op: 'update', value })
      return this
    }
    insert(value: unknown) {
      db.writes.push({ table: this.table, op: 'insert', value })
      return Promise.resolve({ error: null })
    }
    // Makes `await builder.update({...}).eq(...)` resolve.
    then(onFulfilled: (v: { error: null }) => unknown) {
      return Promise.resolve({ error: null }).then(onFulfilled)
    }
  }
  return { supabase: { from: (table: string) => new QueryStub(table) } }
})

import { detectConflicts, executeImportRun } from '../../src/lib/import/importExecution'

const provider = (over: Partial<Provider> = {}): Provider =>
  ({
    id: 'p1',
    org_id: 'org1',
    name: 'Dr. Jane Smith',
    normalized_name: 'dr jane smith',
    category_ids: [],
    is_archived: false,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Provider

const caseType = (id: string, name: string): CaseType =>
  ({ id, org_id: 'org1', name, sort_order: 0, is_archived: false, created_at: '', updated_at: '' }) as CaseType

const categoryOf = (id: string, name: string): Category =>
  ({ id, org_id: 'org1', name, sort_order: 0, is_archived: false, created_at: '', updated_at: '' }) as Category

/** Base params; individual tests override what they exercise. */
function params(over: Partial<Parameters<typeof executeImportRun>[0]> = {}) {
  return {
    orgId: 'org1',
    filename: 'import.xlsx',
    headers: ['Provider', 'Case Type', 'Category'],
    rows: [],
    mappings: [
      { excelHeader: 'Provider', role: 'provider_name' },
      { excelHeader: 'Case Type', role: 'case_type' },
      { excelHeader: 'Category', role: 'category' },
    ],
    orgConstraints: [] as Constraint[],
    orgCaseTypes: [caseType('ct-knee', 'Knee'), caseType('ct-hip', 'Hip')],
    orgCategories: [
      categoryOf('cat-sports', 'Sports Medicine'),
      categoryOf('cat-joint', 'Joint Replacement'),
      categoryOf('cat-trauma', 'Trauma'),
    ],
    conflicts: [],
    resolvedConflicts: {},
    ...over,
  } as Parameters<typeof executeImportRun>[0]
}

/** The category_ids the import ultimately settled on for a provider. */
function finalCategoriesFor(providerId: string): string[] | undefined {
  const calls = api.updateProviderCategories.mock.calls.filter((c) => c[0] === providerId)
  return calls.length ? (calls[calls.length - 1][1] as string[]) : undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  db.writes = []
  db.existingOfferings = new Map()
  let created = 0
  api.createProvider.mockImplementation(async ({ name }: { name: string }) => {
    created += 1
    return { data: { id: `new-p${created}`, name }, error: null }
  })
  api.createCaseType.mockImplementation(async (_org: string, name: string) => ({
    data: { id: `new-ct-${name.toLowerCase()}`, name },
    error: null,
  }))
  api.createCategory.mockImplementation(async (_org: string, name: string) => ({
    data: { id: `new-cat-${name.toLowerCase()}`, name },
    error: null,
  }))
  api.updateProviderCategories.mockResolvedValue({ error: null })
})

describe('detectConflicts', () => {
  it('matches an existing provider on an exact normalised name', () => {
    const conflicts = detectConflicts(
      [{ Provider: 'DR. JANE SMITH' }],
      'Provider',
      [provider({ id: 'p1', normalized_name: 'dr jane smith' })],
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].matchType).toBe('exact')
    expect(conflicts[0].existingProvider.id).toBe('p1')
  })

  it('ignores punctuation and spacing differences', () => {
    const conflicts = detectConflicts(
      [{ Provider: "Dr.  O'Brien,  MD" }],
      'Provider',
      [provider({ id: 'p2', name: 'Dr OBrien MD', normalized_name: 'dr obrien md' })],
    )
    expect(conflicts[0]?.matchType).toBe('exact')
  })

  it('flags a near-miss as fuzzy rather than exact', () => {
    const conflicts = detectConflicts(
      [{ Provider: 'Dr Jane Smyth' }],
      'Provider',
      [provider({ id: 'p1', normalized_name: 'dr jane smith' })],
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].matchType).toBe('fuzzy')
    expect(conflicts[0].similarity).toBeGreaterThan(0.85)
  })

  it('does not flag genuinely different names', () => {
    expect(
      detectConflicts(
        [{ Provider: 'Dr Aaron Fields' }],
        'Provider',
        [provider({ id: 'p1', normalized_name: 'dr jane smith' })],
      ),
    ).toHaveLength(0)
  })

  it('skips blank provider cells instead of matching them', () => {
    expect(
      detectConflicts([{ Provider: '   ' }, { Provider: '' }], 'Provider', [provider()]),
    ).toHaveLength(0)
  })

  it('reports the row index so resolutions map to the right row', () => {
    const conflicts = detectConflicts(
      [{ Provider: 'Someone Else' }, { Provider: 'Dr. Jane Smith' }],
      'Provider',
      [provider({ id: 'p1' })],
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].rowIndex).toBe(1)
  })
})

describe('executeImportRun — categories across multiple rows', () => {
  it('keeps categories from every row of a new provider, not just the last', async () => {
    // One provider offering two case types is the ordinary shape of an import
    // file: same provider, several rows, potentially different categories.
    const result = await executeImportRun(
      params({
        rows: [
          { Provider: 'Dr. New Person', 'Case Type': 'Knee', Category: 'Sports Medicine' },
          { Provider: 'Dr. New Person', 'Case Type': 'Hip', Category: 'Joint Replacement' },
        ],
      }),
    )

    expect(result.providersCreated).toBe(1)
    expect(finalCategoriesFor('new-p1')).toEqual(
      expect.arrayContaining(['cat-sports', 'cat-joint']),
    )
  })

  it('keeps categories from every row when merging into an existing provider', async () => {
    const existing = provider({ id: 'p1', category_ids: ['cat-trauma'] })
    const rows = [
      { Provider: 'Dr. Jane Smith', 'Case Type': 'Knee', Category: 'Sports Medicine' },
      { Provider: 'Dr. Jane Smith', 'Case Type': 'Hip', Category: 'Joint Replacement' },
    ]
    const conflicts = detectConflicts(rows, 'Provider', [existing])

    await executeImportRun(
      params({
        rows,
        conflicts,
        resolvedConflicts: { '0': 'merge', '1': 'merge' },
      }),
    )

    // The provider's pre-existing category must survive alongside both rows'.
    expect(finalCategoriesFor('p1')).toEqual(
      expect.arrayContaining(['cat-trauma', 'cat-sports', 'cat-joint']),
    )
  })

  it('does not duplicate a category repeated across rows', async () => {
    await executeImportRun(
      params({
        rows: [
          { Provider: 'Dr. New Person', 'Case Type': 'Knee', Category: 'Sports Medicine' },
          { Provider: 'Dr. New Person', 'Case Type': 'Hip', Category: 'Sports Medicine' },
        ],
      }),
    )
    const final = finalCategoriesFor('new-p1') ?? []
    expect(final).toEqual([...new Set(final)])
  })

  it('handles a comma-separated category cell', async () => {
    await executeImportRun(
      params({
        rows: [
          {
            Provider: 'Dr. New Person',
            'Case Type': 'Knee',
            Category: 'Sports Medicine, Joint Replacement',
          },
        ],
      }),
    )
    expect(finalCategoriesFor('new-p1')).toEqual(
      expect.arrayContaining(['cat-sports', 'cat-joint']),
    )
  })
})

describe('executeImportRun — provider identity', () => {
  it('creates one provider for a name repeated across rows', async () => {
    const result = await executeImportRun(
      params({
        rows: [
          { Provider: 'Dr. New Person', 'Case Type': 'Knee', Category: '' },
          { Provider: 'Dr. New Person', 'Case Type': 'Hip', Category: '' },
        ],
      }),
    )
    expect(result.providersCreated).toBe(1)
    expect(api.createProvider).toHaveBeenCalledTimes(1)
  })

  it('skips rows the user resolved as skip', async () => {
    const rows = [{ Provider: 'Dr. Jane Smith', 'Case Type': 'Knee', Category: '' }]
    const conflicts = detectConflicts(rows, 'Provider', [provider({ id: 'p1' })])

    const result = await executeImportRun(
      params({ rows, conflicts, resolvedConflicts: { '0': 'skip' } }),
    )

    expect(result.providersCreated).toBe(0)
    expect(result.providersUpdated).toBe(0)
    expect(result.offeringsUpserted).toBe(0)
    expect(api.createProvider).not.toHaveBeenCalled()
  })

  it('creates a distinct provider when the user chooses separate', async () => {
    const rows = [{ Provider: 'Dr. Jane Smith', 'Case Type': 'Knee', Category: '' }]
    const conflicts = detectConflicts(rows, 'Provider', [provider({ id: 'p1' })])

    const result = await executeImportRun(
      params({ rows, conflicts, resolvedConflicts: { '0': 'separate' } }),
    )

    expect(result.providersCreated).toBe(1)
    expect(result.providersUpdated).toBe(0)
  })

  it('counts a merged provider once even across several rows', async () => {
    const rows = [
      { Provider: 'Dr. Jane Smith', 'Case Type': 'Knee', Category: '' },
      { Provider: 'Dr. Jane Smith', 'Case Type': 'Hip', Category: '' },
    ]
    const conflicts = detectConflicts(rows, 'Provider', [provider({ id: 'p1' })])

    const result = await executeImportRun(
      params({ rows, conflicts, resolvedConflicts: { '0': 'merge', '1': 'merge' } }),
    )

    expect(result.providersUpdated).toBe(1)
    expect(api.createProvider).not.toHaveBeenCalled()
  })

  it('does not write anything for a row with a blank provider name', async () => {
    const result = await executeImportRun(
      params({ rows: [{ Provider: '  ', 'Case Type': 'Knee', Category: 'Trauma' }] }),
    )
    expect(result.providersCreated).toBe(0)
    expect(result.offeringsUpserted).toBe(0)
  })

  it('skips a row whose case type cell is blank', async () => {
    const result = await executeImportRun(
      params({ rows: [{ Provider: 'Dr. New Person', 'Case Type': '', Category: '' }] }),
    )
    // The provider is still created; only the offering is skipped.
    expect(result.offeringsUpserted).toBe(0)
  })
})

describe('executeImportRun — new case types and categories', () => {
  it('creates case types and categories the org does not have yet', async () => {
    const result = await executeImportRun(
      params({
        rows: [{ Provider: 'Dr. New Person', 'Case Type': 'Elbow', Category: 'Hand Surgery' }],
      }),
    )
    expect(result.newCaseTypesCount).toBe(1)
    expect(result.newCategoriesCount).toBe(1)
    expect(api.createCaseType).toHaveBeenCalledWith('org1', 'Elbow')
    expect(api.createCategory).toHaveBeenCalledWith('org1', 'Hand Surgery')
  })

  it('reuses an existing case type regardless of cell casing', async () => {
    const result = await executeImportRun(
      params({ rows: [{ Provider: 'Dr. New Person', 'Case Type': 'KNEE', Category: '' }] }),
    )
    expect(result.newCaseTypesCount).toBe(0)
    expect(api.createCaseType).not.toHaveBeenCalled()
  })

  it('records the run in import_history', async () => {
    await executeImportRun(
      params({ rows: [{ Provider: 'Dr. New Person', 'Case Type': 'Knee', Category: '' }] }),
    )
    const history = db.writes.find((w) => w.table === 'import_history')
    expect(history).toBeDefined()
    expect(history!.value).toMatchObject({ org_id: 'org1', filename: 'import.xlsx', rows_processed: 1 })
  })
})
