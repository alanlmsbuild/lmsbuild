// check:tags --crm: the SENSITIVITY tags on Meadow's personal data in
// CRM_DB (sql/crm_02_record_view_tags.sql), read back from Snowflake as
// CRM_APP_USER (CRM_APP_ROLE has USAGE on SHARED_DB.GOVERNANCE, so it sees
// tag values). For every table in CRM_DB.CRM:
//   - its SENSITIVITY tags, on the table and on each column, are exactly
//     those in CRM_SENSITIVITY (scripts/governance-tags.js): none missing,
//     none extra
//   - any governance tag on it has a value scripts/governance-tags.js allows
// and LEAD's personal columns are the ones the person record blanks for an
// anonymised lead (PERSONAL_LEAD_FIELDS, server/meadowPerson.js).
// CRM_DB.BRONZE (FORM_SUBMISSION) is insert-only for the app and isn't
// checked here.
import { connect, execute, destroy } from '../server/db.js'
import { PERSONAL_LEAD_FIELDS } from '../server/meadowPerson.js'
import { TAG_SCHEMA, ALLOWED, CRM_SCHEMAS, CRM_SENSITIVITY } from './governance-tags.js'

export async function checkCrm() {
  const problems = []
  let tables = 0
  const seen = new Set()
  const c = await connect({ as: 'crm', timeoutMs: 30000 })
  const q = (sql, binds = []) => execute(c, sql, binds)
  const checkValue = (where, tag, value) => {
    const key = tag.toLowerCase()
    if (ALLOWED[key] && !ALLOWED[key].includes(value)) problems.push(`${where}: ${tag} "${value}" not allowed`)
  }
  try {
    for (const schema of CRM_SCHEMAS) {
      const [db, sc] = schema.split('.')
      for (const t of await q(`select TABLE_NAME from ${db}.INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA = ? order by 1`, [sc])) {
        tables++
        const name = `${schema}.${t.TABLE_NAME}`
        seen.add(name)
        const expected = CRM_SENSITIVITY[name] ?? {}
        let tableTags
        let columnTags
        try {
          tableTags = await q(`select TAG_DATABASE, TAG_SCHEMA, TAG_NAME, TAG_VALUE, LEVEL from table(${db}.INFORMATION_SCHEMA.TAG_REFERENCES(?, 'table'))`, [name])
          columnTags = await q(`select COLUMN_NAME, TAG_DATABASE, TAG_SCHEMA, TAG_NAME, TAG_VALUE, LEVEL from table(${db}.INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS(?, 'table'))`, [name])
        } catch (err) {
          problems.push(`${name}: can't read its tags as CRM_APP_USER (${err.message.split('\n')[0]})`)
          continue
        }
        const ours = (r) => `${r.TAG_DATABASE}.${r.TAG_SCHEMA}` === TAG_SCHEMA
        let tableSensitivity = null
        for (const r of tableTags.filter((r) => ours(r) && r.LEVEL === 'TABLE')) {
          checkValue(name, r.TAG_NAME, r.TAG_VALUE)
          if (r.TAG_NAME === 'SENSITIVITY') tableSensitivity = r.TAG_VALUE
        }
        if ((expected.table ?? null) !== tableSensitivity) problems.push(`${name}: SENSITIVITY ${tableSensitivity ?? 'none'}, expected ${expected.table ?? 'none'}`)
        const columns = new Map()
        for (const r of columnTags.filter((r) => ours(r) && r.LEVEL === 'COLUMN')) {
          checkValue(`${name}.${r.COLUMN_NAME}`, r.TAG_NAME, r.TAG_VALUE)
          if (r.TAG_NAME === 'SENSITIVITY') columns.set(r.COLUMN_NAME, r.TAG_VALUE)
        }
        const want = new Map(Object.entries(expected.columns ?? {}))
        for (const [col, value] of want) {
          if (columns.get(col) !== value) problems.push(`${name}.${col}: SENSITIVITY ${columns.get(col) ?? 'none'}, expected ${value}`)
        }
        for (const [col, value] of columns) {
          if (!want.has(col)) problems.push(`${name}.${col}: tagged SENSITIVITY ${value} in Snowflake but not in CRM_SENSITIVITY (scripts/governance-tags.js)`)
        }
      }
    }
  } finally {
    await destroy(c)
  }
  for (const name of Object.keys(CRM_SENSITIVITY)) if (!seen.has(name)) problems.push(`${name}: not there, or CRM_APP_ROLE can't see it`)
  const leadPersonal = Object.entries(CRM_SENSITIVITY['CRM_DB.CRM.LEAD'].columns).filter(([, v]) => v === 'personal').map(([k]) => k).sort().join(',')
  if (leadPersonal !== [...PERSONAL_LEAD_FIELDS].sort().join(',')) {
    problems.push(`LEAD's personal columns (${leadPersonal}) aren't the ones the person record blanks when anonymised (PERSONAL_LEAD_FIELDS: ${PERSONAL_LEAD_FIELDS.join(',')})`)
  }

  if (problems.length) {
    for (const p of problems) console.log(`FAIL ${p}`)
    console.log(`\n${problems.length} problem(s) in ${tables} CRM tables.`)
    return 1
  }
  console.log(`${tables} CRM tables: SENSITIVITY exactly as listed (LEAD minor; its name, email, mobile, date of birth and postcode, email addresses and activity notes personal), every value allowed, and the person record blanks exactly LEAD's personal columns when a lead is anonymised.`)
  return 0
}
