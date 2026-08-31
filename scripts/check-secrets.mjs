#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'

const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
const files = output.toString('utf8').split('\0').filter(Boolean)
const failures = []
const ignored = /(^|\/)(package-lock\.json|deno\.lock)$/

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

for (const file of files) {
  const normalized = file.replaceAll('\\', '/')
  if (!existsSync(file) || ignored.test(normalized) || statSync(file).size > 2_000_000) continue
  const content = readFileSync(file, 'utf8')
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    failures.push(`${file}: private key material`)
  }
  if (/postgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]+@/i.test(content)) {
    failures.push(`${file}: database connection string containing credentials`)
  }
  if (/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}\b/.test(content)) {
    failures.push(`${file}: GitHub credential-shaped value`)
  }
  for (const match of content.matchAll(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g)) {
    if (decodeJwtPayload(match[0])?.role === 'service_role') {
      failures.push(`${file}: Supabase service-role JWT`)
    }
  }
}

const trackedEnvs = files.filter((file) => /(^|\/)\.env(?:\.|$)/.test(file.replaceAll('\\', '/')) && !file.endsWith('.example'))
trackedEnvs.forEach((file) => failures.push(`${file}: environment file must not be tracked`))

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`))
  process.exit(1)
}
console.log(`${files.length} repository files passed secret-pattern checks`)
