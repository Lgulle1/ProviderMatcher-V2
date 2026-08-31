#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const directory = 'supabase/migrations'
const files = readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()
const versions = new Map()
const failures = []

for (const file of files) {
  const version = file.split('_', 1)[0]
  if (!/^\d{8,14}$/.test(version)) failures.push(`${file}: invalid numeric migration version`)
  if (versions.has(version)) failures.push(`${file}: version collides with ${versions.get(version)}`)
  versions.set(version, file)
  const path = join(directory, file)
  if (statSync(path).size === 0 || readFileSync(path, 'utf8').trim() === '') {
    failures.push(`${file}: empty migration`)
  }
}

const baseline = readFileSync(join(directory, '20260619090000_baseline_schema.sql'), 'utf8')
for (const table of ['organizations', 'users', 'providers', 'offerings', 'widgets', 'widget_sessions']) {
  if (!baseline.includes(`CREATE TABLE IF NOT EXISTS public.${table}`)) {
    failures.push(`baseline is missing public.${table}`)
  }
}

for (const file of files) {
  const sql = readFileSync(join(directory, file), 'utf8')
  if (/SECURITY DEFINER/i.test(sql) && !/SET search_path\s*=|SET search_path TO/i.test(sql)) {
    failures.push(`${file}: SECURITY DEFINER function without an explicit search_path`)
  }
}

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`))
  process.exit(1)
}
console.log(`${files.length} migrations passed repository invariants`)
