#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const failures = []

function filesUnder(directory) {
  if (!existsSync(directory)) {
    failures.push(`${directory} does not exist; build before checking artifacts`)
    return []
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const appFiles = filesUnder('dist')
const widgetFiles = filesUnder('widget/dist')
const allFiles = [...appFiles, ...widgetFiles]

for (const file of allFiles) {
  if (file.endsWith('.map')) failures.push(`${file}: production source maps are prohibited`)
  if (!['.js', '.html', '.css'].includes(extname(file))) continue
  const content = readFileSync(file, 'utf8')
  if (/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY/.test(content)) failures.push(`${file}: service-role marker in browser artifact`)
  if (/lgulle1\.github\.io/i.test(content)) failures.push(`${file}: personal deployment host in production artifact`)
  if (/development-placeholder/.test(content)) failures.push(`${file}: development configuration in production artifact`)
}

for (const file of appFiles.filter((path) => path.endsWith('.js'))) {
  if (statSync(file).size > 650 * 1024) failures.push(`${file}: JavaScript chunk exceeds 650 KiB`)
}
const widgetBundle = join('widget', 'dist', 'widget.js')
if (existsSync(widgetBundle) && statSync(widgetBundle).size > 150 * 1024) {
  failures.push(`${widgetBundle}: widget exceeds 150 KiB`)
}

const vercel = readFileSync('vercel.json', 'utf8')
for (const header of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy']) {
  if (!vercel.includes(header)) failures.push(`vercel.json: missing ${header}`)
}

if (failures.length) {
  failures.forEach((failure) => console.error(`ERROR: ${failure}`))
  process.exit(1)
}
console.log(`${allFiles.length} build artifacts passed release policy checks`)
