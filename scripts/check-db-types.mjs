#!/usr/bin/env node
// Fails when src/types/database.generated.ts stops matching the schema the
// migrations actually produce.
//
// The committed file is the app's description of the database. Nothing used to
// verify it, so it drifted: on 2026-08-31 the hand-written types declared six
// organizations columns non-nullable that the database allows to be null, and
// typed two columns as unions the database does not constrain. The compiler was
// checking the app against a description rather than the schema.
//
// This regenerates from the disposable database that verify-database.mjs has
// already built from the migrations, so it needs no credentials and no network:
// it compares the repo against its own migrations. Run it while that database
// is up -- verify-database.mjs does exactly that.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const committedPath = resolve(root, 'src/types/database.generated.ts')
const supabase = process.platform === 'win32' ? 'supabase.exe' : 'supabase'

/** Line endings and a BOM differ by who generated the file, not by schema. */
function normalize(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimEnd()
}

const result = spawnSync(supabase, ['gen', 'types', 'typescript', '--local'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
})

if (result.error) {
  console.error(`Could not run supabase gen types: ${result.error.message}`)
  process.exit(1)
}
if (result.status !== 0) {
  console.error(`supabase gen types failed with exit code ${result.status ?? 'unknown'}`)
  if (result.stderr) console.error(result.stderr)
  process.exit(1)
}

const generated = normalize(result.stdout)
const committed = normalize(readFileSync(committedPath, 'utf8'))

if (generated === committed) {
  const tables = (committed.match(/^ {6}[a-z_]+: \{$/gm) ?? []).length
  console.log(`src/types/database.generated.ts matches the migrations (${tables} definitions)`)
  process.exit(0)
}

// Report the first difference rather than dumping a thousand lines.
const a = committed.split('\n')
const b = generated.split('\n')
const firstDiff = a.findIndex((line, i) => line !== b[i])

console.error('src/types/database.generated.ts does not match the migrations.')
console.error('')
console.error(`Committed: ${a.length} lines`)
console.error(`Generated: ${b.length} lines`)
if (firstDiff !== -1) {
  console.error(`First difference at line ${firstDiff + 1}:`)
  console.error(`  committed: ${JSON.stringify(a[firstDiff] ?? '<end of file>')}`)
  console.error(`  generated: ${JSON.stringify(b[firstDiff] ?? '<end of file>')}`)
}
console.error('')
console.error('A migration changed the schema without the types following it.')
console.error('Regenerate and commit the result:')
console.error('  supabase gen types typescript --local > src/types/database.generated.ts')
process.exit(1)
