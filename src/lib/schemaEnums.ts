import type { Json } from '../types/database'

/**
 * The database constrains these columns with CHECK, and Postgres does not
 * expose a CHECK as an enum -- so `supabase gen types` reports them as plain
 * text and the app loses the narrower type it needs.
 *
 * These restore it at the boundary. They validate rather than cast: a value
 * outside the domain falls back to a sensible default instead of being
 * asserted into the union, so a row written outside the app cannot smuggle an
 * unexpected string into a component that switches on it. The fallbacks match
 * the column defaults in the schema.
 */

const CONSTRAINT_TYPES = ['binary', 'range', 'exact'] as const
const MAPS_TO_VALUES = ['0', '1', 'both'] as const
const PROVIDER_MODES = ['default', 'simple', 'advanced'] as const
const ORG_MODES = ['simple', 'advanced'] as const

export type ConstraintType = (typeof CONSTRAINT_TYPES)[number]
export type MapsTo = (typeof MAPS_TO_VALUES)[number]
export type ProviderMode = (typeof PROVIDER_MODES)[number]
export type OrgMode = (typeof ORG_MODES)[number]

function oneOf<T extends readonly string[]>(
  allowed: T,
  value: unknown,
  fallback: T[number]
): T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback
}

export function asConstraintType(value: unknown, fallback: ConstraintType = 'binary'): ConstraintType {
  return oneOf(CONSTRAINT_TYPES, value, fallback)
}

export function asMapsTo(value: unknown, fallback: MapsTo): MapsTo {
  return oneOf(MAPS_TO_VALUES, value, fallback)
}

export function asProviderMode(value: unknown, fallback: ProviderMode = 'default'): ProviderMode {
  return oneOf(PROVIDER_MODES, value, fallback)
}

export function asOrgMode(value: unknown, fallback: OrgMode = 'simple'): OrgMode {
  return oneOf(ORG_MODES, value, fallback)
}

/**
 * jsonb reads back as Json, a recursive union that includes arrays and
 * primitives. The config columns the app edits are always objects, so this
 * narrows to the shape the UI works with and treats anything else as empty
 * rather than letting an array reach code expecting keys.
 */
export function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * The inverse, for writes. Round-tripping through JSON is what Postgres stores
 * anyway -- it drops undefined values and proves the result is serialisable --
 * so this is a real conversion rather than an assertion that could be wrong.
 */
export function toJson(value: Record<string, unknown>): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}
