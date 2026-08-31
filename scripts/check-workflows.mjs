#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument } from 'yaml'

const directory = '.github/workflows'
const files = readdirSync(directory).filter((name) => /\.ya?ml$/i.test(name))
const failures = []

function visit(value, file, path = []) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, file, [...path, String(index)]))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key]
    if (key === 'uses' && typeof child === 'string') {
      const isLocal = child.startsWith('./') || child.startsWith('docker://')
      if (!isLocal && !/@[0-9a-f]{40}$/i.test(child)) {
        failures.push(`${file}:${nextPath.join('.')}: third-party action must be pinned to a 40-character commit SHA`)
      }
    }
    visit(child, file, nextPath)
  }
}

for (const file of files) {
  const source = readFileSync(join(directory, file), 'utf8')
  const document = parseDocument(source, { uniqueKeys: true })
  for (const error of document.errors) failures.push(`${file}: ${error.message}`)
  if (document.errors.length > 0) continue
  const workflow = document.toJS()
  if (!workflow?.on) failures.push(`${file}: missing workflow trigger`)
  if (workflow?.on?.pull_request_target !== undefined) {
    failures.push(`${file}: pull_request_target is prohibited for untrusted changes`)
  }
  const jobs = Object.values(workflow?.jobs ?? {})
  const hasLeastPrivilegeDeclaration = Boolean(workflow?.permissions) || (jobs.length > 0 && jobs.every((job) => job.permissions))
  if (!hasLeastPrivilegeDeclaration || workflow?.permissions === 'write-all') {
    failures.push(`${file}: declare least-privilege workflow or per-job permissions`)
  }
  if (file.startsWith('deploy-')) {
    if (workflow?.on?.workflow_dispatch === undefined) failures.push(`${file}: deployments must be manual`)
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      if (!job.environment) failures.push(`${file}: deployment job ${jobName} must use a protected environment`)
    }
  }
  visit(workflow, file)
}

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`))
  process.exit(1)
}
console.log(`${files.length} workflows passed syntax and policy checks`)
