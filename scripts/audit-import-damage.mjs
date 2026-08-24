#!/usr/bin/env node
/**
 * READ-ONLY audit for damage from the two import bugs fixed on 2026-08-24.
 *
 *   1. c936c9c — categories were overwritten row-by-row, so a provider spanning
 *      several rows kept only its last row's categories.
 *   2. 823d49d — a blank Excel header shifted every later column onto its
 *      neighbour's data; a blank *leading* header emptied the provider name and
 *      the whole import silently did nothing.
 *
 * Neither left an error behind, so this looks for their fingerprints instead.
 * It cannot prove damage without the original spreadsheets — it reports
 * candidates and the evidence for each, for a human to judge.
 *
 * Issues only SELECTs. Nothing here writes, updates or deletes.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path) {
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) {
      env[m[1]] = m[2].trim()
    }
  }
  return env
}

const env = loadEnv('.env')
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

/** Pages through a table so a >1000-row tenant is not silently truncated. */
async function selectAll(table, columns, filter = (q) => q) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supabase.from(table).select(columns)).range(
      from,
      from + 999,
    )
    if (error) {
      throw new Error(`${table}: ${error.message}`)
    }
    rows.push(...data)
    if (data.length < 1000) {
      return rows
    }
  }
}

const line = (s = '') => console.log(s)
const heading = (s) => {
  line()
  line('='.repeat(72))
  line(s)
  line('='.repeat(72))
}

const orgs = await selectAll('organizations', 'id, name')
const orgName = new Map(orgs.map((o) => [o.id, o.name]))

heading('IMPORT HISTORY')

let history = []
try {
  history = await selectAll('import_history', '*')
} catch (e) {
  line(`  could not read import_history: ${e.message}`)
}

if (history.length === 0) {
  line('  No import runs recorded. Neither bug can have affected your data')
  line('  through the wizard, since it never ran.')
} else {
  history.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  line(`  ${history.length} import run(s) recorded.`)
  line()
  for (const h of history) {
    const created = h.providers_created ?? 0
    const updated = h.providers_updated ?? 0
    const processed = h.rows_processed ?? 0
    line(`  ${String(h.created_at).slice(0, 19)}  ${h.filename}`)
    line(
      `      org=${orgName.get(h.org_id) ?? h.org_id}  rows=${processed}  ` +
        `created=${created}  updated=${updated}  conflicts=${h.duplicates_detected ?? 0}`,
    )

    // Bug 2, leading-blank-header form: rows went in, nothing came out.
    if (processed > 0 && created + updated === 0) {
      line(`      >> SUSPECT (bug 2): ${processed} rows processed but no provider`)
      line(`         created or updated. Consistent with a blank leading column`)
      line(`         emptying every provider name.`)
    }
    // Bug 1 needs a provider to appear on more than one row.
    if (processed > created + updated && created + updated > 0) {
      line(
        `      .. ${processed} rows for ${created + updated} providers, so some ` +
          `provider spanned multiple rows (bug 1 applies here)`,
      )
    }
  }
}

heading('BUG 1 — PROVIDERS THAT MAY HAVE LOST CATEGORIES')
line('A provider with several offerings came from several import rows. If those')
line('rows carried categories, only the last row survived. Providers below have')
line('multiple offerings but suspiciously few categories.')
line()

const providers = await selectAll('providers', 'id, org_id, name, category_ids, is_archived', (q) =>
  q.eq('is_archived', false),
)
const offerings = await selectAll('offerings', 'id, provider_id, case_type_id, is_archived', (q) =>
  q.eq('is_archived', false),
)

const offeringsByProvider = new Map()
for (const o of offerings) {
  offeringsByProvider.set(o.provider_id, (offeringsByProvider.get(o.provider_id) ?? 0) + 1)
}

const multiRow = providers.filter((p) => (offeringsByProvider.get(p.id) ?? 0) >= 2)
const suspect = multiRow.filter((p) => (p.category_ids ?? []).length <= 1)

line(`  providers (non-archived):            ${providers.length}`)
line(`  with 2+ offerings (multi-row):       ${multiRow.length}`)
line(`  of those, with 0 or 1 categories:    ${suspect.length}`)
line()

if (suspect.length === 0) {
  line('  No candidates. Either imports carried no categories, or nothing was lost.')
} else {
  const zero = suspect.filter((p) => (p.category_ids ?? []).length === 0)
  const one = suspect.filter((p) => (p.category_ids ?? []).length === 1)
  line(`  ${zero.length} with NO categories, ${one.length} with exactly one:`)
  line()
  for (const p of suspect.slice(0, 40)) {
    line(
      `    ${(orgName.get(p.org_id) ?? '?').slice(0, 18).padEnd(20)} ${p.name.slice(0, 34).padEnd(36)} ` +
        `offerings=${offeringsByProvider.get(p.id)}  categories=${(p.category_ids ?? []).length}`,
    )
  }
  if (suspect.length > 40) {
    line(`    ... and ${suspect.length - 40} more`)
  }
  line()
  line('  Note: a provider legitimately having one category is normal. This is a')
  line('  list to eyeball against your source spreadsheets, not a defect list.')
}

heading('BUG 2 — CASE TYPES / CATEGORIES THAT LOOK LIKE SHIFTED DATA')
line('A blank middle column made each header read its neighbour\'s cell, so the')
line('import created case types and categories out of the wrong column: binary')
line('flags, numbers, phone numbers or URLs rather than clinical names.')
line()

const caseTypes = await selectAll('case_types', 'id, org_id, name, is_archived', (q) =>
  q.eq('is_archived', false),
)
const categories = await selectAll('categories', 'id, org_id, name, is_archived', (q) =>
  q.eq('is_archived', false),
)

/** Names that should never come from a clinical case-type or category column. */
function looksShifted(name) {
  const v = String(name).trim().toLowerCase()
  if (v === '') return 'empty'
  if (/^(0|1|true|false|yes|no|y|n)$/.test(v)) return 'binary flag'
  if (/^-?\d+([.,]\d+)?$/.test(v)) return 'bare number'
  if (/^https?:\/\//.test(v) || v.includes('.com') || v.includes('.org')) return 'url'
  if (/^[\d\s()+-]{7,}$/.test(v)) return 'phone number'
  if (v.length > 60) return 'very long (free text?)'
  return null
}

let shiftedFindings = 0
for (const [label, rows] of [
  ['case type', caseTypes],
  ['category', categories],
]) {
  for (const r of rows) {
    const why = looksShifted(r.name)
    if (why) {
      shiftedFindings += 1
      line(
        `    >> ${label.padEnd(10)} "${r.name}"  (${why})  org=${orgName.get(r.org_id) ?? r.org_id}`,
      )
    }
  }
}

line()
if (shiftedFindings === 0) {
  line(`  Checked ${caseTypes.length} case types and ${categories.length} categories.`)
  line('  None look like they came from the wrong column.')
} else {
  line(`  ${shiftedFindings} suspicious name(s) above, out of ` +
    `${caseTypes.length} case types and ${categories.length} categories.`)
}

heading('ORPHANS AND UNUSED RECORDS')

const usedCaseTypeIds = new Set(offerings.map((o) => o.case_type_id).filter(Boolean))
const unusedCaseTypes = caseTypes.filter((ct) => !usedCaseTypeIds.has(ct.id))

const usedCategoryIds = new Set()
for (const p of providers) {
  for (const c of p.category_ids ?? []) {
    usedCategoryIds.add(c)
  }
}
const unusedCategories = categories.filter((c) => !usedCategoryIds.has(c.id))

line(`  case types with no offering:  ${unusedCaseTypes.length}`)
for (const ct of unusedCaseTypes.slice(0, 15)) {
  line(`      "${ct.name}"  org=${orgName.get(ct.org_id) ?? ct.org_id}`)
}
line()
line(`  categories on no provider:    ${unusedCategories.length}`)
for (const c of unusedCategories.slice(0, 15)) {
  line(`      "${c.name}"  org=${orgName.get(c.org_id) ?? c.org_id}`)
}
line()
line('  An unused category is the strongest single sign of bug 1: the import')
line('  created it from a spreadsheet cell, then a later row overwrote the')
line('  provider it was attached to, leaving it attached to nothing.')

heading('SUMMARY')
line(`  import runs:                          ${history.length}`)
line(`  runs that processed rows but wrote 0: ${history.filter((h) => (h.rows_processed ?? 0) > 0 && (h.providers_created ?? 0) + (h.providers_updated ?? 0) === 0).length}`)
line(`  multi-offering providers, <=1 category: ${suspect.length}`)
line(`  suspicious case-type/category names:  ${shiftedFindings}`)
line(`  categories attached to nobody:        ${unusedCategories.length}`)
line()
line('  Read-only: this script issued SELECTs only and changed nothing.')
line()
