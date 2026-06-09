import type { Constraint, Offering, Question } from '../types/database'

type ConstraintsMap = Record<string, unknown>

export function hasConstraintDataForSkip<T extends Offering>(offerings: T[], c: Constraint): boolean {
  if (c.type === 'range') {
    const minK = c.mapped_key
    const maxK = c.secondary_mapped_key
    return offerings.some((o) => {
      const cons = (o.constraints ?? {}) as ConstraintsMap
      const a = cons[minK]
      const b = maxK ? cons[maxK] : undefined
      const hasA = a !== null && a !== undefined && a !== ''
      const hasB = maxK ? b !== null && b !== undefined && b !== '' : false
      return hasA || hasB
    })
  }
  const k = c.mapped_key
  return offerings.some((o) => {
    const cons = (o.constraints ?? {}) as ConstraintsMap
    const v = cons[k]
    return v !== null && v !== undefined && v !== ''
  })
}

export function filterBinary<T extends Offering>(offerings: T[], c: Constraint, pickedYes: boolean): T[] {
  const targetMode = pickedYes ? c.yes_maps_to : c.no_maps_to
  if (targetMode === 'both') return offerings
  return offerings.filter((o) => {
    const cons = (o.constraints ?? {}) as ConstraintsMap
    const v = cons[c.mapped_key]
    if (targetMode === '1') return v === 1 || v === '1' || v === true
    return v === undefined || v === null || v === 0 || v === '0' || v === false
  })
}

export function filterRange<T extends Offering>(offerings: T[], c: Constraint, answer: number): T[] {
  const minKey = c.mapped_key
  const maxKey = c.secondary_mapped_key ?? ''
  return offerings.filter((o) => {
    const cons = (o.constraints ?? {}) as ConstraintsMap
    const min = Number(cons[minKey] ?? 0)
    const max = maxKey ? Number(cons[maxKey] ?? 999) : 999
    return min <= answer && answer <= max
  })
}

export function filterExact<T extends Offering>(offerings: T[], c: Constraint, answer: string): T[] {
  const key = c.mapped_key
  const t = answer.trim().toLowerCase()
  return offerings.filter((o) => {
    const cons = (o.constraints ?? {}) as ConstraintsMap
    const v = cons[key]
    return String(v ?? '').toLowerCase() === t
  })
}

export function getUniqueConstraintValues<T extends Offering>(offerings: T[], mappedKey: string): string[] {
  const set = new Set<string>()
  for (const o of offerings) {
    const cons = (o.constraints ?? {}) as ConstraintsMap
    const v = cons[mappedKey]
    if (v !== null && v !== undefined && v !== '') set.add(String(v))
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export interface ReplayInput {
  caseTypeId: string | null
  questions: Question[]
  constraintsById: Map<string, Constraint>
  offerings: Offering[]
  answers: Record<string, unknown>
}

export interface ReplayResult {
  providerIds: string[]
  bypassed: boolean
}

/**
 * Replay a stored session's answers against current data to reconstruct
 * the set of provider IDs that would have been shown. Matches the widget's
 * showResults logic: filter by case_type, walk questions in order applying
 * the matching filter, stop early if provider="yes" (bypass), dedupe by
 * provider_id at the end.
 */
export function replaySession(input: ReplayInput): ReplayResult {
  if (!input.caseTypeId) return { providerIds: [], bypassed: false }

  let active = input.offerings.filter((o) => o.case_type_id === input.caseTypeId)

  const ordered = [...input.questions]
    .filter((q) => !q.is_archived && q.question_type !== 'entry')
    .sort((a, b) => a.order_rank - b.order_rank)

  let bypassed = false
  for (const q of ordered) {
    const raw = input.answers[q.id]

    if (q.question_type === 'provider') {
      if (raw === 'yes') {
        bypassed = true
        break
      }
      continue
    }

    if (q.question_type === 'location') continue

    if (q.question_type === 'clinical' && q.constraint_id) {
      const c = input.constraintsById.get(q.constraint_id)
      if (!c) continue
      if (!hasConstraintDataForSkip(active, c)) continue
      if (raw === undefined || raw === null) continue

      if (c.type === 'binary') {
        active = filterBinary(active, c, raw === 'yes' || raw === true)
      } else if (c.type === 'range') {
        const n = Number(raw)
        if (Number.isFinite(n)) active = filterRange(active, c, n)
      } else {
        active = filterExact(active, c, String(raw))
      }
    }
  }

  const seen = new Set<string>()
  const providerIds: string[] = []
  for (const o of active) {
    if (!seen.has(o.provider_id)) {
      seen.add(o.provider_id)
      providerIds.push(o.provider_id)
    }
  }
  return { providerIds, bypassed }
}
