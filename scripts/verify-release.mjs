#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const steps = [
  ['Workflow policy', npm, ['run', 'check:workflows'], root],
  ['Secret scan', npm, ['run', 'check:secrets'], root],
  ['TypeScript', 'npx', ['tsc', '-b', '--force'], root],
  ['Lint', npm, ['run', 'lint'], root],
  ['Unit tests', npm, ['test'], root],
  ['Application build', npm, ['run', 'build'], root],
  ['Widget production build', 'node', ['build.js'], resolve(root, 'widget'), {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://release-check.example',
    SUPABASE_ANON_KEY: 'public-release-check-placeholder',
  }],
  ['Public Edge invariants', npm, ['run', 'check:edge-safety'], root],
  ['Migration invariants', npm, ['run', 'check:migrations'], root],
  ['Edge Function types', npm, ['run', 'check:edge-types'], root],
  ['Tenant test static checks', npm, ['run', 'test:tenant:lint'], root],
  ['Tenant test types', npm, ['run', 'test:tenant:typecheck'], root],
  ['Build artifact policy', npm, ['run', 'check:artifacts'], root],
  ['Root dependency audit', npm, ['audit', '--audit-level=high'], root],
  ['Widget dependency audit', npm, ['audit', '--audit-level=high'], resolve(root, 'widget')],
]

for (const [label, command, args, cwd, extraEnv = {}] of steps) {
  console.log(`\n=== ${label} ===`)
  const executable = process.platform === 'win32' && command === 'npx' ? 'npx.cmd' : command
  const result = spawnSync(executable, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(`${label} could not start: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nRelease verification passed.')
console.log('Database execution is separate: npm run verify:db -- --allow-reset')
