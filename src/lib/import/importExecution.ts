import { createCaseType } from '../api/caseTypes'
import { createCategory } from '../api/categories'
import { createProvider } from '../api/providers'
import { updateProviderCategories } from '../api/dataTable'
import { fuzzyMatch, normalizeName } from '../parsers/nameNormalizer'
import { supabase } from '../supabase'
import type { CaseType, Category, Constraint, Provider } from '../../types/database'

/** Subset of wizard column mapping; kept here to avoid circular imports with the wizard component. */
export interface ImportColumnMapping {
  excelHeader: string
  role: string
  locationId?: string
  constraintId?: string
  rangePosition?: 'min' | 'max'
}

export interface ConflictItem {
  rowIndex: number
  incomingName: string
  existingProvider: Provider
  matchType: 'exact' | 'fuzzy'
  similarity?: number
}

function normLookupKey(val: string): string {
  return val.trim().toLowerCase()
}

function splitCategoryCell(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function detectConflicts(
  rows: Record<string, string>[],
  providerHeader: string,
  existingProviders: Provider[]
): ConflictItem[] {
  const conflicts: ConflictItem[] = []

  rows.forEach((row, rowIndex) => {
    const raw = (row[providerHeader] ?? '').trim()
    if (!raw) {
      return
    }
    const incomingNorm = normalizeName(raw)

    let exactMatch: Provider | null = null
    for (const p of existingProviders) {
      const en = (p.normalized_name ?? normalizeName(p.name)).trim()
      if (incomingNorm === en) {
        exactMatch = p
        break
      }
    }

    if (exactMatch) {
      conflicts.push({
        rowIndex,
        incomingName: raw,
        existingProvider: exactMatch,
        matchType: 'exact',
      })
      return
    }

    let bestP: Provider | null = null
    let bestScore = 0
    for (const p of existingProviders) {
      const en = (p.normalized_name ?? normalizeName(p.name)).trim()
      const score = fuzzyMatch(incomingNorm, en)
      if (score > bestScore) {
        bestScore = score
        bestP = p
      }
    }

    if (bestP && bestScore > 0.85) {
      conflicts.push({
        rowIndex,
        incomingName: raw,
        existingProvider: bestP,
        matchType: 'fuzzy',
        similarity: bestScore,
      })
    }
  })

  return conflicts
}

function cellVal(row: Record<string, string>, header: string | undefined): string {
  if (!header) {
    return ''
  }
  return (row[header] ?? '').trim()
}

function isTruthyBinary(val: string): boolean {
  const v = val.toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'y'
}

function isStrictBinaryOk(val: string): boolean {
  if (val === '') {
    return true
  }
  const v = val.toLowerCase()
  return v === '0' || v === '1' || v === 'true' || v === 'false' || v === 'yes' || v === 'no' || v === 'y' || v === 'n'
}

export { isStrictBinaryOk }

export interface ExecuteImportParams {
  orgId: string
  filename: string
  headers: string[]
  rows: Record<string, string>[]
  mappings: ImportColumnMapping[]
  orgConstraints: Constraint[]
  orgCaseTypes: CaseType[]
  orgCategories: Category[]
  conflicts: ConflictItem[]
  resolvedConflicts: Record<string, 'merge' | 'separate' | 'skip'>
}

export interface ExecuteImportResult {
  providersCreated: number
  providersUpdated: number
  offeringsUpserted: number
  newCaseTypesCount: number
  newCategoriesCount: number
}

export async function executeImportRun(params: ExecuteImportParams): Promise<ExecuteImportResult> {
  const {
    orgId,
    filename,
    headers,
    rows,
    mappings,
    orgConstraints,
    orgCaseTypes,
    orgCategories,
    conflicts,
    resolvedConflicts,
  } = params

  const providerHeader = mappings.find((m) => m.role === 'provider_name')?.excelHeader
  const caseTypeHeader = mappings.find((m) => m.role === 'case_type')?.excelHeader
  const categoryHeader = mappings.find((m) => m.role === 'category')?.excelHeader

  const conflictByRow = new Map<number, ConflictItem>()
  conflicts.forEach((c) => conflictByRow.set(c.rowIndex, c))

  let providersCreated = 0
  let providersUpdated = 0
  let offeringsUpserted = 0
  let newCaseTypesCount = 0
  let newCategoriesCount = 0

  const caseTypeIdByNorm = new Map<string, string>()
  const categoryIdByNorm = new Map<string, string>()

  orgCaseTypes.forEach((ct) => caseTypeIdByNorm.set(normLookupKey(ct.name), ct.id))
  orgCategories.forEach((cat) => categoryIdByNorm.set(normLookupKey(cat.name), cat.id))

  const uniqueCaseValues = new Set<string>()
  const uniqueCategoryValues = new Set<string>()
  if (caseTypeHeader) {
    rows.forEach((row) => {
      const v = cellVal(row, caseTypeHeader)
      if (v) {
        uniqueCaseValues.add(v)
      }
    })
  }
  if (categoryHeader) {
    rows.forEach((row) => {
      const v = cellVal(row, categoryHeader)
      splitCategoryCell(v).forEach((categoryPart) => uniqueCategoryValues.add(categoryPart))
    })
  }

  for (const name of uniqueCaseValues) {
    const nk = normLookupKey(name)
    if (caseTypeIdByNorm.has(nk)) {
      continue
    }
    const { data, error } = await createCaseType(orgId, toTitleCase(name))
    if (error || !data) {
      throw new Error(error ?? 'Failed to create case type')
    }
    newCaseTypesCount += 1
    caseTypeIdByNorm.set(normLookupKey(data.name), data.id)
  }

  for (const name of uniqueCategoryValues) {
    const nk = normLookupKey(name)
    if (categoryIdByNorm.has(nk)) {
      continue
    }
    const { data, error } = await createCategory(orgId, toTitleCase(name))
    if (error || !data) {
      throw new Error(error ?? 'Failed to create category')
    }
    newCategoriesCount += 1
    categoryIdByNorm.set(normLookupKey(data.name), data.id)
  }

  const constraintMappings = mappings.filter((m) => m.role === 'constraint' && m.constraintId)
  const locationMappings = mappings.filter((m) => m.role === 'location' && m.locationId)

  const constraintById = new Map(orgConstraints.map((c) => [c.id, c]))
  const importedProviderNameToId: Record<string, string> = {}

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!providerHeader) {
      continue
    }

    const provName = cellVal(row, providerHeader)
    if (!provName) {
      continue
    }
    const normalizedProvName = normalizeName(provName)

    const conflict = conflictByRow.get(rowIndex)
    const resolution = conflict ? resolvedConflicts[String(rowIndex)] : undefined

    if (conflict && resolution === 'skip') {
      continue
    }

    let providerId: string | null = null
    const isMerge = Boolean(conflict && resolution === 'merge')

    if (importedProviderNameToId[normalizedProvName]) {
      providerId = importedProviderNameToId[normalizedProvName]
    } else if (isMerge && conflict) {
      providerId = conflict.existingProvider.id
      providersUpdated += 1
      importedProviderNameToId[normalizedProvName] = providerId
    } else if (conflict && resolution === 'separate') {
      const { data, error } = await createProvider({ org_id: orgId, name: provName })
      if (error || !data) {
        throw new Error(error ?? 'Failed to create provider')
      }
      providerId = data.id
      providersCreated += 1
      importedProviderNameToId[normalizedProvName] = providerId
    } else if (!conflict) {
      const { data, error } = await createProvider({ org_id: orgId, name: provName })
      if (error || !data) {
        throw new Error(error ?? 'Failed to create provider')
      }
      providerId = data.id
      providersCreated += 1
      importedProviderNameToId[normalizedProvName] = providerId
    } else {
      continue
    }

    if (!providerId) {
      continue
    }

    const caseVal = caseTypeHeader ? cellVal(row, caseTypeHeader) : ''
    const caseTypeId = caseVal ? caseTypeIdByNorm.get(normLookupKey(caseVal)) : undefined
    if (!caseTypeId) {
      continue
    }

    const constraintsObj: Record<string, unknown> = {}

    for (const cm of constraintMappings) {
      const c = constraintById.get(cm.constraintId!)
      if (!c) {
        continue
      }
      const raw = cellVal(row, cm.excelHeader)
      if (c.type === 'binary') {
        constraintsObj[c.mapped_key] = raw === '' ? 0 : isTruthyBinary(raw) ? 1 : 0
      } else if (c.type === 'range') {
        const num = raw === '' ? NaN : Number(raw)
        if (cm.rangePosition === 'min') {
          constraintsObj[c.mapped_key] = Number.isFinite(num) ? num : 0
        } else if (cm.rangePosition === 'max') {
          const maxKey = c.secondary_mapped_key
          if (maxKey) {
            constraintsObj[maxKey] = Number.isFinite(num) ? num : 999
          }
        }
      } else {
        constraintsObj[c.mapped_key] = raw === '' ? null : String(raw)
      }
    }

    const locationIds: string[] = []
    for (const lm of locationMappings) {
      const cell = (row[lm.excelHeader] ?? '').trim()
      if (lm.locationId && isTruthyBinary(cell)) {
        locationIds.push(lm.locationId)
      }
    }

    const categoryIdsFromRow: string[] = []
    if (categoryHeader) {
      const catVal = cellVal(row, categoryHeader)
      const categoryParts = splitCategoryCell(catVal)
      for (const categoryPart of categoryParts) {
        const cid = categoryIdByNorm.get(normLookupKey(categoryPart))
        if (cid) {
          categoryIdsFromRow.push(cid)
        }
      }
    }

    if (categoryIdsFromRow.length > 0) {
      const existingCats = isMerge && conflict ? conflict.existingProvider.category_ids ?? [] : []
      const mergedCats = [...new Set([...existingCats, ...categoryIdsFromRow])]
      const { error: catErr } = await updateProviderCategories(providerId, mergedCats)
      if (catErr) {
        throw new Error(catErr)
      }
    }

    const { data: existingOffering } = await supabase
      .from('offerings')
      .select('id, constraints, location_ids')
      .eq('provider_id', providerId)
      .eq('case_type_id', caseTypeId)
      .eq('org_id', orgId)
      .eq('is_archived', false)
      .maybeSingle()

    const prevConstraints = (existingOffering?.constraints as Record<string, unknown>) ?? {}
    const mergedConstraints = { ...prevConstraints, ...constraintsObj }

    const prevLocs = (existingOffering?.location_ids as string[]) ?? []
    const mergedLocIds = [...new Set([...prevLocs, ...locationIds])]

    if (existingOffering) {
      const { error: upErr } = await supabase
        .from('offerings')
        .update({
          location_ids: mergedLocIds,
          constraints: mergedConstraints,
        })
        .eq('id', existingOffering.id)

      if (upErr) {
        throw new Error(upErr.message)
      }
    } else {
      const { error: insErr } = await supabase.from('offerings').insert({
        org_id: orgId,
        provider_id: providerId,
        case_type_id: caseTypeId,
        location_ids: locationIds,
        constraints: mergedConstraints,
        is_archived: false,
      })

      if (insErr) {
        throw new Error(insErr.message)
      }
    }

    offeringsUpserted += 1
  }

  const { error: histErr } = await supabase.from('import_history').insert({
    org_id: orgId,
    filename,
    rows_processed: rows.length,
    providers_created: providersCreated,
    providers_updated: providersUpdated,
    duplicates_detected: conflicts.length,
    errors: 0,
    mapping_template: {
      headers,
      mappings,
    },
  })

  if (histErr) {
    throw new Error(histErr.message)
  }

  return {
    providersCreated,
    providersUpdated,
    offeringsUpserted,
    newCaseTypesCount,
    newCategoriesCount,
  }
}
