/**
 * Backfill providers_shown for historical widget_sessions.
 *
 * Usage:
 *   tsx scripts/backfill-providers-shown.ts            # dry-run
 *   tsx scripts/backfill-providers-shown.ts --apply    # write changes
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
 *
 * Behavior:
 *   - Only touches rows where providers_shown is empty/null.
 *   - Replays the matcher against each session's stored answers + current
 *     provider data to reconstruct the impression list.
 *   - Sanity check: if providers_clicked is NOT a subset of the replay
 *     result, the row is logged as "divergent" and skipped (do not write
 *     a list that contradicts what the user actually clicked).
 *   - If providers_shown_source column exists, marks backfilled rows as 'replay'.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { replaySession } from '../src/lib/matcher'
import type { Constraint, Offering, Question } from '../src/types/database'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  process.exit(1)
}

const apply = process.argv.includes('--apply')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

interface SessionRow {
  id: string
  session_id: string
  org_id: string | null
  case_type_id: string | null
  answers: Record<string, unknown> | null
  providers_clicked: string[] | null
  providers_shown: string[] | null
}

async function main() {
  console.log(apply ? '🟢 APPLY mode — will write changes' : '🟡 DRY-RUN — no writes')

  const { data: sessions, error } = await supabase
    .from('widget_sessions')
    .select('id, session_id, org_id, case_type_id, answers, providers_clicked, providers_shown')
    .or('providers_shown.is.null,providers_shown.eq.{}')

  if (error) throw error
  if (!sessions || sessions.length === 0) {
    console.log('No sessions to backfill.')
    return
  }

  console.log(`Found ${sessions.length} sessions to consider.`)

  // Group by org so we only fetch provider data once per org.
  const byOrg = new Map<string, SessionRow[]>()
  for (const s of sessions as SessionRow[]) {
    if (!s.org_id) continue
    if (!byOrg.has(s.org_id)) byOrg.set(s.org_id, [])
    byOrg.get(s.org_id)!.push(s)
  }

  let scanned = 0
  let wouldWrite = 0
  let divergent = 0
  let written = 0
  let skipped = 0

  for (const [orgId, orgSessions] of byOrg) {
    console.log(`\n── Org ${orgId} (${orgSessions.length} sessions) ──`)

    const [qRes, cRes, oRes] = await Promise.all([
      supabase.from('questions').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('constraints').select('*').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('offerings').select('*').eq('org_id', orgId).eq('is_archived', false),
    ])
    if (qRes.error) throw qRes.error
    if (cRes.error) throw cRes.error
    if (oRes.error) throw oRes.error

    const questions = (qRes.data ?? []) as Question[]
    const constraints = (cRes.data ?? []) as Constraint[]
    const offerings = (oRes.data ?? []) as Offering[]
    const constraintsById = new Map(constraints.map((c) => [c.id, c]))

    for (const s of orgSessions) {
      scanned++
      if (!s.case_type_id) {
        skipped++
        continue
      }

      const { providerIds } = replaySession({
        caseTypeId: s.case_type_id,
        questions,
        constraintsById,
        offerings,
        answers: s.answers ?? {},
      })

      const clicked = s.providers_clicked ?? []
      const shownSet = new Set(providerIds)
      const missingClicks = clicked.filter((id) => !shownSet.has(id))

      if (missingClicks.length > 0) {
        divergent++
        console.log(
          `  ⚠️  ${s.session_id}: ${missingClicks.length} clicked provider(s) NOT in replay — skipping. ` +
            `Clicked=[${clicked.join(',')}] Replay=[${providerIds.length} ids]`,
        )
        continue
      }

      wouldWrite++
      if (!apply) {
        console.log(`  ✓ ${s.session_id}: would write ${providerIds.length} provider IDs`)
        continue
      }

      const { error: updErr } = await supabase
        .from('widget_sessions')
        .update({
          providers_shown: providerIds,
          ...(await hasSourceColumn() ? { providers_shown_source: 'replay' } : {}),
        })
        .eq('id', s.id)

      if (updErr) {
        console.log(`  ✗ ${s.session_id}: update failed — ${updErr.message}`)
      } else {
        written++
      }
    }
  }

  console.log(`\n── Summary ──`)
  console.log(`Scanned:    ${scanned}`)
  console.log(`Would write: ${wouldWrite}`)
  console.log(`Written:     ${written}`)
  console.log(`Divergent:   ${divergent}  (clicked providers not in replay; investigate)`)
  console.log(`Skipped:     ${skipped}  (no case_type_id)`)
}

let _sourceColCache: boolean | null = null
async function hasSourceColumn(): Promise<boolean> {
  if (_sourceColCache !== null) return _sourceColCache
  const { error } = await supabase
    .from('widget_sessions')
    .select('providers_shown_source')
    .limit(1)
  _sourceColCache = !error
  return _sourceColCache
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
