import { describe, expect, it } from 'vitest'
import type { Constraint, Offering, Question } from '../../src/types/database'
import {
  filterBinary,
  filterExact,
  filterRange,
  getUniqueConstraintValues,
  hasConstraintDataForSkip,
  resolveAutoSkip,
  replaySession,
} from '../../src/lib/matcher'

function constraint(over: Partial<Constraint> = {}): Constraint {
  return {
    id: 'c1',
    org_id: 'org1',
    name: 'Test constraint',
    type: 'binary',
    mapped_key: 'k',
    secondary_mapped_key: null,
    min_allowed_value: null,
    max_allowed_value: null,
    yes_label: 'Yes',
    no_label: 'No',
    yes_maps_to: '1',
    no_maps_to: '0',
    sort_order: 0,
    is_archived: false,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

function offering(over: Partial<Offering> = {}): Offering {
  return {
    id: 'o1',
    provider_id: 'p1',
    case_type_id: 'ct1',
    org_id: 'org1',
    location_ids: [],
    constraints: {},
    is_archived: false,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

function question(over: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    org_id: 'org1',
    question_text: 'Q',
    subtext: null,
    question_type: 'clinical',
    input_type: 'buttons',
    constraint_id: null,
    required: false,
    order_rank: 0,
    system_config: {},
    is_archived: false,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

describe('filterBinary', () => {
  const c = constraint({ mapped_key: 'accepts_peds' })

  it('accepts every truthy encoding the importer can produce', () => {
    const offerings = [
      offering({ id: 'num', constraints: { accepts_peds: 1 } }),
      offering({ id: 'str', constraints: { accepts_peds: '1' } }),
      offering({ id: 'bool', constraints: { accepts_peds: true } }),
    ]
    expect(filterBinary(offerings, c, true).map((o) => o.id)).toEqual(['num', 'str', 'bool'])
  })

  it('treats a missing key as "no" rather than excluding it', () => {
    const offerings = [
      offering({ id: 'absent', constraints: {} }),
      offering({ id: 'null', constraints: { accepts_peds: null } }),
      offering({ id: 'zero', constraints: { accepts_peds: 0 } }),
      offering({ id: 'yes', constraints: { accepts_peds: 1 } }),
    ]
    expect(filterBinary(offerings, c, false).map((o) => o.id)).toEqual(['absent', 'null', 'zero'])
  })

  it('passes everything through when the answer maps to "both"', () => {
    const both = constraint({ mapped_key: 'accepts_peds', yes_maps_to: 'both' })
    const offerings = [
      offering({ id: 'a', constraints: { accepts_peds: 0 } }),
      offering({ id: 'b', constraints: { accepts_peds: 1 } }),
    ]
    expect(filterBinary(offerings, both, true)).toHaveLength(2)
  })
})

describe('filterRange', () => {
  const c = constraint({ type: 'range', mapped_key: 'min_age', secondary_mapped_key: 'max_age' })

  it('keeps offerings whose range contains the answer, inclusive at both ends', () => {
    const offerings = [
      offering({ id: 'in', constraints: { min_age: 18, max_age: 65 } }),
      offering({ id: 'lower-edge', constraints: { min_age: 40, max_age: 90 } }),
      offering({ id: 'upper-edge', constraints: { min_age: 0, max_age: 40 } }),
      offering({ id: 'below', constraints: { min_age: 41, max_age: 99 } }),
      offering({ id: 'above', constraints: { min_age: 0, max_age: 39 } }),
    ]
    expect(filterRange(offerings, c, 40).map((o) => o.id)).toEqual(['in', 'lower-edge', 'upper-edge'])
  })

  it('treats a missing bound as unbounded, not as zero', () => {
    const offerings = [offering({ id: 'open', constraints: { max_age: 65 } })]
    expect(filterRange(offerings, c, 3)).toHaveLength(1)
  })

  it('falls back to an open upper bound when no secondary key is mapped', () => {
    const single = constraint({ type: 'range', mapped_key: 'min_age', secondary_mapped_key: null })
    const offerings = [offering({ constraints: { min_age: 18 } })]
    expect(filterRange(offerings, single, 900)).toHaveLength(1)
    expect(filterRange(offerings, single, 5)).toHaveLength(0)
  })
})

describe('filterExact', () => {
  const c = constraint({ type: 'exact', mapped_key: 'insurance' })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const offerings = [
      offering({ id: 'match', constraints: { insurance: 'Aetna' } }),
      offering({ id: 'other', constraints: { insurance: 'Cigna' } }),
    ]
    expect(filterExact(offerings, c, '  aetna ').map((o) => o.id)).toEqual(['match'])
  })

  it('does not match offerings that are missing the key', () => {
    const offerings = [offering({ constraints: {} })]
    expect(filterExact(offerings, c, 'aetna')).toHaveLength(0)
  })
})

describe('hasConstraintDataForSkip', () => {
  it('is false when no offering carries the key, so the question can be skipped', () => {
    const c = constraint({ mapped_key: 'accepts_peds' })
    const offerings = [offering({ constraints: { other: 1 } }), offering({ constraints: {} })]
    expect(hasConstraintDataForSkip(offerings, c)).toBe(false)
  })

  it('treats empty string as absent', () => {
    const c = constraint({ mapped_key: 'accepts_peds' })
    expect(hasConstraintDataForSkip([offering({ constraints: { accepts_peds: '' } })], c)).toBe(false)
  })

  it('is true for a range when only one of the two bounds is populated', () => {
    const c = constraint({ type: 'range', mapped_key: 'min_age', secondary_mapped_key: 'max_age' })
    expect(hasConstraintDataForSkip([offering({ constraints: { max_age: 65 } })], c)).toBe(true)
  })
})

describe('getUniqueConstraintValues', () => {
  it('dedupes and sorts', () => {
    const offerings = [
      offering({ constraints: { insurance: 'Cigna' } }),
      offering({ constraints: { insurance: 'Aetna' } }),
      offering({ constraints: { insurance: 'Cigna' } }),
      offering({ constraints: { insurance: '' } }),
    ]
    expect(getUniqueConstraintValues(offerings, 'insurance')).toEqual(['Aetna', 'Cigna'])
  })
})

describe('resolveAutoSkip', () => {
  const withData = constraint({ id: 'c-has', mapped_key: 'has_key' })
  const withoutData = constraint({ id: 'c-none', mapped_key: 'never_mapped' })
  const map = new Map([
    ['c-has', withData],
    ['c-none', withoutData],
  ])
  const offerings = [offering({ constraints: { has_key: 1 } })]

  it('stays put when the current question has data', () => {
    const questions = [question({ id: 'q1', constraint_id: 'c-has', order_rank: 0 })]
    expect(resolveAutoSkip(questions, 0, map, offerings)).toEqual({ nextIndex: 0, skipped: [] })
  })

  it('skips consecutive clinical questions with no backing data', () => {
    const questions = [
      question({ id: 'q1', constraint_id: 'c-none' }),
      question({ id: 'q2', constraint_id: 'c-none' }),
      question({ id: 'q3', constraint_id: 'c-has' }),
    ]
    const result = resolveAutoSkip(questions, 0, map, offerings)
    expect(result.nextIndex).toBe(2)
    expect(result.skipped.map((q) => q.id)).toEqual(['q1', 'q2'])
  })

  it('stops at a non-clinical question rather than skipping past it', () => {
    const questions = [
      question({ id: 'q1', constraint_id: 'c-none' }),
      question({ id: 'q-loc', question_type: 'location' }),
      question({ id: 'q3', constraint_id: 'c-none' }),
    ]
    const result = resolveAutoSkip(questions, 0, map, offerings)
    expect(result.nextIndex).toBe(1)
    expect(result.skipped.map((q) => q.id)).toEqual(['q1'])
  })

  it('stops on an unknown constraint instead of silently skipping', () => {
    const questions = [question({ id: 'q1', constraint_id: 'c-missing' })]
    expect(resolveAutoSkip(questions, 0, map, offerings)).toEqual({ nextIndex: 0, skipped: [] })
  })

  it('can run off the end when every remaining question is skippable', () => {
    const questions = [
      question({ id: 'q1', constraint_id: 'c-none' }),
      question({ id: 'q2', constraint_id: 'c-none' }),
    ]
    expect(resolveAutoSkip(questions, 0, map, offerings).nextIndex).toBe(2)
  })

  it('respects the starting index', () => {
    const questions = [
      question({ id: 'q1', constraint_id: 'c-none' }),
      question({ id: 'q2', constraint_id: 'c-has' }),
    ]
    expect(resolveAutoSkip(questions, 1, map, offerings)).toEqual({ nextIndex: 1, skipped: [] })
  })
})

describe('replaySession', () => {
  const pedsConstraint = constraint({ id: 'c-peds', mapped_key: 'accepts_peds' })

  const baseOfferings = [
    offering({ id: 'o1', provider_id: 'p1', case_type_id: 'ct1', constraints: { accepts_peds: 1 } }),
    offering({ id: 'o2', provider_id: 'p2', case_type_id: 'ct1', constraints: { accepts_peds: 0 } }),
    offering({ id: 'o3', provider_id: 'p3', case_type_id: 'ct2', constraints: { accepts_peds: 1 } }),
  ]

  const clinicalQ = question({ id: 'q-peds', constraint_id: 'c-peds', order_rank: 1 })

  it('returns nothing when no case type was selected', () => {
    expect(
      replaySession({
        caseTypeId: null,
        questions: [clinicalQ],
        constraintsById: new Map([['c-peds', pedsConstraint]]),
        offerings: baseOfferings,
        answers: {},
      }),
    ).toEqual({ providerIds: [], bypassed: false })
  })

  it('scopes to the selected case type before applying any answer', () => {
    const result = replaySession({
      caseTypeId: 'ct1',
      questions: [],
      constraintsById: new Map(),
      offerings: baseOfferings,
      answers: {},
    })
    expect(result.providerIds).toEqual(['p1', 'p2'])
  })

  it('applies a clinical answer to narrow the provider set', () => {
    const result = replaySession({
      caseTypeId: 'ct1',
      questions: [clinicalQ],
      constraintsById: new Map([['c-peds', pedsConstraint]]),
      offerings: baseOfferings,
      answers: { 'q-peds': 'yes' },
    })
    expect(result.providerIds).toEqual(['p1'])
  })

  it('stops at a provider-request bypass and reports it', () => {
    const providerQ = question({ id: 'q-prov', question_type: 'provider', order_rank: 0 })
    const result = replaySession({
      caseTypeId: 'ct1',
      questions: [providerQ, clinicalQ],
      constraintsById: new Map([['c-peds', pedsConstraint]]),
      offerings: baseOfferings,
      answers: { 'q-prov': 'yes', 'q-peds': 'yes' },
    })
    // Bypass short-circuits before the clinical filter runs.
    expect(result).toEqual({ providerIds: ['p1', 'p2'], bypassed: true })
  })

  it('walks questions in order_rank order, not array order', () => {
    const wide = constraint({ id: 'c-wide', type: 'range', mapped_key: 'min_age', secondary_mapped_key: 'max_age' })
    const offerings = [
      offering({ id: 'a', provider_id: 'p1', case_type_id: 'ct1', constraints: { accepts_peds: 1, min_age: 0, max_age: 10 } }),
      offering({ id: 'b', provider_id: 'p2', case_type_id: 'ct1', constraints: { accepts_peds: 1, min_age: 60, max_age: 99 } }),
    ]
    const result = replaySession({
      caseTypeId: 'ct1',
      questions: [
        question({ id: 'q-age', constraint_id: 'c-wide', order_rank: 5 }),
        question({ id: 'q-peds', constraint_id: 'c-peds', order_rank: 1 }),
      ],
      constraintsById: new Map([['c-peds', pedsConstraint], ['c-wide', wide]]),
      offerings,
      answers: { 'q-peds': 'yes', 'q-age': 8 },
    })
    expect(result.providerIds).toEqual(['p1'])
  })

  it('skips a question whose constraint has no data in the active set', () => {
    const orphan = constraint({ id: 'c-orphan', mapped_key: 'never_mapped' })
    const result = replaySession({
      caseTypeId: 'ct1',
      questions: [question({ id: 'q-orphan', constraint_id: 'c-orphan', order_rank: 1 })],
      constraintsById: new Map([['c-orphan', orphan]]),
      offerings: baseOfferings,
      // An answer is present, but no offering carries the key, so it must not filter.
      answers: { 'q-orphan': 'yes' },
    })
    expect(result.providerIds).toEqual(['p1', 'p2'])
  })

  it('ignores archived questions', () => {
    const result = replaySession({
      caseTypeId: 'ct1',
      questions: [question({ ...clinicalQ, is_archived: true })],
      constraintsById: new Map([['c-peds', pedsConstraint]]),
      offerings: baseOfferings,
      answers: { 'q-peds': 'yes' },
    })
    expect(result.providerIds).toEqual(['p1', 'p2'])
  })

  it('dedupes providers that have several matching offerings', () => {
    const offerings = [
      offering({ id: 'o1', provider_id: 'p1', case_type_id: 'ct1' }),
      offering({ id: 'o2', provider_id: 'p1', case_type_id: 'ct1' }),
      offering({ id: 'o3', provider_id: 'p2', case_type_id: 'ct1' }),
    ]
    const result = replaySession({
      caseTypeId: 'ct1',
      questions: [],
      constraintsById: new Map(),
      offerings,
      answers: {},
    })
    expect(result.providerIds).toEqual(['p1', 'p2'])
  })

  it('leaves the set untouched when a question was never answered', () => {
    const result = replaySession({
      caseTypeId: 'ct1',
      questions: [clinicalQ],
      constraintsById: new Map([['c-peds', pedsConstraint]]),
      offerings: baseOfferings,
      answers: {},
    })
    expect(result.providerIds).toEqual(['p1', 'p2'])
  })
})
