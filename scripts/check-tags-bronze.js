// check:tags --bronze: the governance tags on bronze (sql/load_10_ilr_dummy.sql),
// NOTE: the 7 CAPTURE_DB.TEST_BASELINE tables can't be verified by either user yet (TRANSFORM_ROLE has nothing in CAPTURE_DB; DATA_LOAD_ROLE can't see tag values), so only RAW is checked.
// read back from Snowflake as TRANSFORM_USER: every table in SHARED_DB.RAW
// and OPTIONS_DB.RAW (the app's API tables, BRONZE_API_TABLES, included).
// Every table
//   - has a comment
//   - has all seven tags (the SOURCE_FILE load records: LAYER, OWNER,
//     REFRESH, SENSITIVITY), each with a value scripts/governance-tags.js
//     allows, LAYER bronze
//   - SOURCE names exactly the data sets its SOURCE_FILE rows name (or its
//     API, for BRONZE_API_TABLES)
// CAPTURE_DB.TEST_BASELINE's tables aren't checked: TRANSFORM_ROLE has
// nothing in CAPTURE_DB, and DATA_LOAD_ROLE can't see tag values (no USAGE
// on SHARED_DB.GOVERNANCE). The check says so rather than passing them.
// and any column tag has an allowed value. Columns take their table's
// SENSITIVITY unless tagged otherwise, so none is required on columns.
import { connect, execute, destroy } from '../server/db.js'
import { TAG_SCHEMA, TAGS, ALLOWED, SOURCE, BRONZE_SCHEMAS, BRONZE_RECORD_TABLES, BRONZE_API_TABLES } from './governance-tags.js'

const RECORD_TAGS = ['LAYER', 'OWNER', 'REFRESH', 'SENSITIVITY']

export async function checkBronze() {
  const problems = []
  let tables = 0
  const checked = new Set()
  const checkValue = (where, tag, value) => {
    const key = tag.toLowerCase()
    if (key === 'source' && !SOURCE.test(value)) problems.push(`${where}: SOURCE "${value}"`)
    else if (ALLOWED[key] && !ALLOWED[key].includes(value)) problems.push(`${where}: ${tag} "${value}" not allowed`)
    else if (key === 'attribution' && !value.trim()) problems.push(`${where}: empty ATTRIBUTION`)
  }
  // One table: its comment, tags and column tags. expected: the SOURCE it
  // should have (null for a load record).
  async function checkTable(q, name, comment, expected) {
    tables++
    checked.add(name)
    const db = name.split('.')[0]
    if (!comment?.trim()) problems.push(`${name}: no comment`)
    const tags = new Map()
    for (const r of await q(`select TAG_DATABASE, TAG_SCHEMA, TAG_NAME, TAG_VALUE, LEVEL from table(${db}.INFORMATION_SCHEMA.TAG_REFERENCES(?, 'table'))`, [name])) {
      if (`${r.TAG_DATABASE}.${r.TAG_SCHEMA}` === TAG_SCHEMA && r.LEVEL === 'TABLE') tags.set(r.TAG_NAME, r.TAG_VALUE)
    }
    for (const tag of expected === null ? RECORD_TAGS : TAGS) {
      if (!tags.has(tag)) problems.push(`${name}: no ${tag} tag`)
      else checkValue(name, tag, tags.get(tag))
    }
    if (tags.has('LAYER') && tags.get('LAYER') !== 'bronze') problems.push(`${name}: LAYER ${tags.get('LAYER')}, not bronze`)
    if (expected && tags.has('SOURCE') && tags.get('SOURCE') !== expected) problems.push(`${name}: SOURCE "${tags.get('SOURCE')}", SOURCE_FILE says "${expected}"`)
    for (const r of await q(`select COLUMN_NAME, TAG_DATABASE, TAG_SCHEMA, TAG_NAME, TAG_VALUE, LEVEL from table(${db}.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS(?, 'table'))`, [name])) {
      if (`${r.TAG_DATABASE}.${r.TAG_SCHEMA}` === TAG_SCHEMA && r.LEVEL === 'COLUMN') checkValue(`${name}.${r.COLUMN_NAME}`, r.TAG_NAME, r.TAG_VALUE)
    }
  }

  // Tag values are visible only to a role with USAGE on SHARED_DB.GOVERNANCE:
  // TRANSFORM_ROLE has it, DATA_LOAD_ROLE doesn't. So RAW is read as
  // TRANSFORM_USER (which sees every RAW table, the app's API tables too).
  async function checkSchema(as, schema) {
    const c = await connect({ as, timeoutMs: 30000 })
    try {
      const q = (sql, binds = []) => execute(c, sql, binds)
      const [db, sc] = schema.split('.')
      const sources = new Map()
      for (const r of await q(`select TARGETTABLE, listagg(distinct SOURCE, ',') within group (order by SOURCE) as S from ${schema}.SOURCE_FILE group by 1`)) sources.set(r.TARGETTABLE, r.S)
      for (const t of await q(`select TABLE_NAME, COMMENT from ${db}.INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA = ? order by 1`, [sc])) {
        const name = `${schema}.${t.TABLE_NAME}`
        if (BRONZE_RECORD_TABLES.includes(name)) await checkTable(q, name, t.COMMENT, null)
        else if (sources.has(name)) await checkTable(q, name, t.COMMENT, sources.get(name))
        else if (BRONZE_API_TABLES[name]) await checkTable(q, name, t.COMMENT, BRONZE_API_TABLES[name].source)
        else problems.push(`${name}: not in SOURCE_FILE or BRONZE_API_TABLES (scripts/governance-tags.js)`)
      }
    } finally {
      await destroy(c)
    }
  }
  for (const schema of BRONZE_SCHEMAS.filter((s) => !s.startsWith('CAPTURE_DB.'))) await checkSchema('transform', schema)
  for (const name of Object.keys(BRONZE_API_TABLES)) if (!checked.has(name)) problems.push(`${name}: not there, or TRANSFORM_ROLE can't see it`)

  if (problems.length) {
    for (const p of problems) console.log(`FAIL ${p}`)
    console.log(`\n${problems.length} problem(s) in ${tables} bronze tables.`)
    return 1
  }
  console.log(`Not checked: ${BRONZE_SCHEMAS.filter((x) => x.startsWith('CAPTURE_DB.')).join(', ')} (no service user can read both its tables and tag values).`)
  console.log(`${tables} bronze tables: every one described, all seven tags on every data table (four on the load records), every value allowed, every SOURCE as SOURCE_FILE has it.`)
  return 0
}
