// After every silver build (decision 21), from Snowflake itself, as
// TRANSFORM_USER: every table in SHARED_DB.SILVER and OPTIONS_DB.SILVER
//   - has a comment, and so does every column
//   - has all seven governance tags, each with an allowed value
//   - has SENSITIVITY on every column
//   - names only data sets that are in SOURCE_FILE, or API sources whose
//     RAW table has rows (its SOURCE tags)
// and the tags' allowed values in Snowflake are those in
// scripts/governance-tags.js.
//   npm run check:tags
import { connect, execute, destroy } from '../server/db.js'
import { TAG_SCHEMA, TAGS, ALLOWED, SOURCE, API_SOURCES } from './governance-tags.js'

const SCHEMAS = ['SHARED_DB.SILVER', 'OPTIONS_DB.SILVER']
const problems = []
const c = await connect({ as: 'transform', timeoutMs: 30000 })
const q = (sql, binds = []) => execute(c, sql, binds)
let tables = 0
let columns = 0
try {
  for (const tag of Object.keys(ALLOWED)) {
    const [r] = await q(`select system$get_tag_allowed_values('${TAG_SCHEMA}.${tag.toUpperCase()}') as V`)
    const snowflake = JSON.parse(r.V ?? '[]').sort().join(',')
    if (snowflake !== [...ALLOWED[tag]].sort().join(',')) problems.push(`tag ${tag}: Snowflake allows ${snowflake}, scripts/governance-tags.js ${[...ALLOWED[tag]].sort().join(',')}`)
  }
  const sources = new Set((await q(`select distinct SOURCE from SHARED_DB.RAW.SOURCE_FILE union select distinct SOURCE from OPTIONS_DB.RAW.SOURCE_FILE`)).map((r) => r.SOURCE))
  for (const [name, table] of Object.entries(API_SOURCES)) {
    const [r] = await q(`select count(*) as N from ${table}`)
    if (Number(r.N) > 0) sources.add(name)
  }
  const checkSource = (where, value) => { for (const s of value.split(',')) if (!sources.has(s)) problems.push(`${where}: SOURCE ${s} is not in SOURCE_FILE or API_SOURCES (scripts/governance-tags.js)`) }
  const checkValue = (where, tag, value) => {
    const key = tag.toLowerCase()
    if (key === 'source') { if (!SOURCE.test(value)) problems.push(`${where}: SOURCE "${value}"`); else checkSource(where, value) }
    else if (ALLOWED[key] && !ALLOWED[key].includes(value)) problems.push(`${where}: ${tag} "${value}" not allowed`)
    else if (key === 'attribution' && !value.trim()) problems.push(`${where}: empty ATTRIBUTION`)
  }
  for (const schema of SCHEMAS) {
    const [db, sc] = schema.split('.')
    for (const t of await q(`select TABLE_NAME, COMMENT from ${db}.INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA = ? order by 1`, [sc])) {
      tables++
      const name = `${schema}.${t.TABLE_NAME}`
      if (!t.COMMENT?.trim()) problems.push(`${name}: no comment`)
      const tableTags = new Map()
      for (const r of await q(`select TAG_DATABASE, TAG_SCHEMA, TAG_NAME, TAG_VALUE, LEVEL from table(${db}.INFORMATION_SCHEMA.TAG_REFERENCES(?, 'table'))`, [name])) {
        if (`${r.TAG_DATABASE}.${r.TAG_SCHEMA}` !== TAG_SCHEMA) continue
        if (r.LEVEL === 'TABLE') tableTags.set(r.TAG_NAME, r.TAG_VALUE)
      }
      for (const tag of TAGS) {
        if (!tableTags.has(tag)) problems.push(`${name}: no ${tag} tag`)
        else checkValue(name, tag, tableTags.get(tag))
      }
      const colTags = new Map()
      for (const r of await q(`select COLUMN_NAME, TAG_DATABASE, TAG_SCHEMA, TAG_NAME, TAG_VALUE, LEVEL from table(${db}.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS(?, 'table'))`, [name])) {
        if (`${r.TAG_DATABASE}.${r.TAG_SCHEMA}` !== TAG_SCHEMA || r.LEVEL !== 'COLUMN') continue
        if (!colTags.has(r.COLUMN_NAME)) colTags.set(r.COLUMN_NAME, new Map())
        colTags.get(r.COLUMN_NAME).set(r.TAG_NAME, r.TAG_VALUE)
      }
      for (const col of await q(`select COLUMN_NAME, COMMENT from ${db}.INFORMATION_SCHEMA.COLUMNS where TABLE_SCHEMA = ? and TABLE_NAME = ? order by ORDINAL_POSITION`, [sc, t.TABLE_NAME])) {
        columns++
        const where = `${name}.${col.COLUMN_NAME}`
        if (!col.COMMENT?.trim()) problems.push(`${where}: no comment`)
        const tags = colTags.get(col.COLUMN_NAME) ?? new Map()
        if (!tags.has('SENSITIVITY')) problems.push(`${where}: no SENSITIVITY tag`)
        for (const [tag, value] of tags) checkValue(where, tag, value)
      }
    }
  }
} finally {
  await destroy(c)
}
if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`)
  console.log(`\n${problems.length} problem(s) in ${tables} silver tables.`)
  process.exit(1)
}
console.log(`${tables} silver tables, ${columns} columns: every one described, all seven tags on every table, SENSITIVITY on every column, every value allowed, every SOURCE in SOURCE_FILE.`)
