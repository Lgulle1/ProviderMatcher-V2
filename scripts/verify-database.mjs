#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (!process.argv.includes('--allow-reset')) {
  console.error('Refusing to reset the local database without --allow-reset.')
  console.error('Run: npm run verify:db -- --allow-reset')
  process.exit(2)
}

const root = resolve(import.meta.dirname, '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const supabase = process.platform === 'win32' ? 'supabase.exe' : 'supabase'
let stackStarted = false

function run(label, command, args, options = {}) {
  console.log(`\n=== ${label} ===`)
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
  })
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
  return result.stdout ?? ''
}

function parseEnv(output) {
  const values = {}
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(?:"([^"]*)"|(.*))$/.exec(line.trim())
    if (match) values[match[1]] = match[2] ?? match[3] ?? ''
  }
  return values
}

try {
  run('Start disposable Supabase', supabase, [
    'start', '-x', 'studio,imgproxy,inbucket,edge-runtime,analytics,vector,functions,realtime',
  ])
  stackStarted = true
  run('Rebuild database from migrations', supabase, ['db', 'reset', '--local'])
  run('Database lint', supabase, ['db', 'lint', '--local', '--level', 'error'])

  const local = parseEnv(run('Read local test configuration', supabase, ['status', '-o', 'env'], { capture: true }))
  for (const name of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
    if (!local[name]) throw new Error(`Supabase status did not return ${name}`)
  }

  run('Tenant, RBAC, storage, and import integration tests', npm, ['run', 'test:tenant'], {
    env: {
      ALLOW_REMOTE_SUPABASE_TESTS: 'true',
      SUPABASE_TEST_URL: local.API_URL,
      SUPABASE_TEST_ANON_KEY: local.ANON_KEY,
      SUPABASE_TEST_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    },
  })
  console.log('\nDisposable database verification passed.')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (stackStarted) {
    const stopped = spawnSync(supabase, ['stop', '--no-backup'], { cwd: root, stdio: 'inherit' })
    if (stopped.status !== 0) process.exitCode = 1
  }
}
