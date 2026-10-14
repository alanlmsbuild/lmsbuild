// Before every silver build (decision 21): nothing dbt makes can come out
// untagged or undescribed. Parses the dbt project and checks every model:
//   - its contract is enforced (so every column it makes is declared in its
//     .yml, and dbt fails the build if the table differs)
//   - it has a description, and every column has a description and a type
//   - its meta has all seven tags (layer, owner, source, licence,
//     attribution, refresh, sensitivity) with allowed values, none over
//     Snowflake's 256 characters; a column's own
//     sensitivity, source, licence or attribution are checked the same way
// The allowed values: scripts/governance-tags.js (check:tags compares them
// with Snowflake's after the build).
//   npm run check:dbt
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDbt } from './dbt.js'
import { ALLOWED, SOURCE } from './governance-tags.js'


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parsed = runDbt(['parse', '--quiet'], { stdio: 'pipe' })
if (parsed.status !== 0) {
  console.error(parsed.stdout, parsed.stderr)
  console.error('dbt parse failed.')
  process.exit(1)
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dbt', 'target', 'manifest.json'), 'utf8'))

const problems = []
const checkValue = (where, key, value) => {
  // Snowflake's limit on a tag value.
  if (String(value ?? '').length > 256) problems.push(`${where}: ${key} is ${String(value).length} characters (Snowflake allows 256)`)
  if (key === 'source') { if (!SOURCE.test(value ?? '')) problems.push(`${where}: source "${value ?? ''}" is not one or more data set names (as in SOURCE_FILE.SOURCE)`) }
  else if (key === 'attribution') { if (!String(value ?? '').trim()) problems.push(`${where}: no attribution (write "none" if the licence asks for none)`) }
  else if (!ALLOWED[key].includes(value)) problems.push(`${where}: ${key} "${value ?? ''}" is not one of ${ALLOWED[key].join(', ')}`)
}
const models = Object.values(manifest.nodes).filter((n) => n.resource_type === 'model' && n.package_name === 'rarebit')
for (const m of models) {
  const where = m.name
  if (!m.config.contract?.enforced) problems.push(`${where}: contract not enforced`)
  if (!m.description?.trim()) problems.push(`${where}: no description`)
  const meta = m.config.meta ?? {}
  for (const key of ['layer', 'owner', 'source', 'licence', 'attribution', 'refresh', 'sensitivity']) checkValue(where, key, meta[key])
  const columns = Object.values(m.columns ?? {})
  if (!columns.length) problems.push(`${where}: no columns declared`)
  for (const c of columns) {
    const cw = `${where}.${c.name}`
    if (!c.description?.trim()) problems.push(`${cw}: no description`)
    if (!c.data_type) problems.push(`${cw}: no data_type`)
    const cm = { ...(c.meta ?? {}), ...(c.config?.meta ?? {}) }
    for (const key of ['sensitivity', 'source', 'licence', 'attribution']) if (key in cm) checkValue(cw, key, cm[key])
  }
}
if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`)
  console.log(`\n${problems.length} problem(s): fix the .yml before building.`)
  process.exit(1)
}
console.log(`${models.length} models checked: contracts enforced, every model and column described and typed, every tag present with an allowed value.`)
