// check-test-flags.js - every learner's records carry the learner's
// ISTESTDATA, so the test reset (sql/test_reset_02_reset.sql) finds all of
// a test learner's rows and never touches a real one.
//
// For each of the tables the test snapshot covers (ILR.LEARNER and
// ILR.EMPLOYER are compared with their organisation) and ILR.RECORD_CHANGE,
// counts rows whose ISTESTDATA differs from their learner's, and rows with
// no learner at all. Then, for every table holding an employer ID, counts
// rows whose employer doesn't exist or belongs to another organisation, and
// tables with an EMPLOYERID column this doesn't cover. Every count should
// be 0. Read-only: counts only, no personal details.
// Needs the Snowflake connection in server/.env.
//
// Usage:
//   npm run check:test-flags

import { connect, execute, destroy } from '../server/db.js'

const LEARNER_TABLES = ['LEARNING_DELIVERY', 'PRIOR_ATTAINMENT', 'LLDD_HEALTH_PROBLEM', 'LEARNER_FAM', 'EMPLOYMENT_STATUS',
  'EMPLOYMENT_STATUS_MONITORING', 'LEARNING_DELIVERY_FAM', 'APP_FIN_RECORD', 'HOURS_RECORD', 'OFFICER_ASSIGNMENT',
  'LEARNER_EMPLOYER', 'RECORD_CHANGE']

// The same query as check 3 in sql/test_reset_02_reset.sql.
const TEST_FLAGS_QUERY = [
  `select 'LEARNER' as TABLE_NAME, count(*) as ROWS_,
     coalesce(count_if(l.ISTESTDATA is distinct from o.ISTESTDATA), 0) as DIFFERENT, coalesce(count_if(o.ORGANISATIONID is null), 0) as NO_LEARNER
   from CAPTURE_DB.ILR.LEARNER l
   left join CAPTURE_DB.ACCESS.ORGANISATION o on o.ORGANISATIONID = l.ORGANISATIONID`,
  ...LEARNER_TABLES.map((t) => `select '${t}', count(*),
     coalesce(count_if(t.ISTESTDATA is distinct from l.ISTESTDATA), 0), coalesce(count_if(l.LEARNREFNUMBER is null), 0)
   from CAPTURE_DB.ILR.${t} t
   left join CAPTURE_DB.ILR.LEARNER l on l.LEARNREFNUMBER = t.LEARNREFNUMBER`),
  `select 'EMPLOYER', count(*),
     coalesce(count_if(e.ISTESTDATA is distinct from o.ISTESTDATA), 0), coalesce(count_if(o.ORGANISATIONID is null), 0)
   from CAPTURE_DB.ILR.EMPLOYER e
   left join CAPTURE_DB.ACCESS.ORGANISATION o on o.ORGANISATIONID = e.ORGANISATIONID`,
].join('\nunion all\n')

// Every table holding an employer ID, with how to find the row's
// organisation. The same query as check 4 in sql/test_reset_02_reset.sql.
const EMPLOYER_REFERENCES = [
  ['ILR.LEARNER_EMPLOYER', 'left join CAPTURE_DB.ILR.LEARNER l on l.LEARNREFNUMBER = t.LEARNREFNUMBER', 'l.ORGANISATIONID', ''],
  ['ILR.EMPLOYMENT_STATUS', 'left join CAPTURE_DB.ILR.LEARNER l on l.LEARNREFNUMBER = t.LEARNREFNUMBER', 'l.ORGANISATIONID', 'where t.EMPLOYERID is not null'],
  ['ACCESS.APP_USER', '', 't.ORGANISATIONID', 'where t.EMPLOYERID is not null'],
  ['BURROW.WITNESS_CONFIRMATION', `left join CAPTURE_DB.BURROW.EVIDENCE v on v.EVIDENCE_ID = t.EVIDENCE_ID
     left join CAPTURE_DB.ILR.LEARNER l on l.LEARNREFNUMBER = v.LEARNREFNUMBER`, 'l.ORGANISATIONID', ''],
]
const EMPLOYER_REFERENCES_QUERY = [
  ...EMPLOYER_REFERENCES.map(([table, join, org, where]) => `select '${table}' as TABLE_NAME, count(*) as ROWS_,
     coalesce(count_if(e.EMPLOYERID is null), 0) as NO_EMPLOYER,
     coalesce(count_if(e.ORGANISATIONID is distinct from ${org} and e.EMPLOYERID is not null), 0) as OTHER_ORGANISATION
   from CAPTURE_DB.${table} t
   left join CAPTURE_DB.ILR.EMPLOYER e on e.EMPLOYERID = t.EMPLOYERID
   ${join}
   ${where}`),
  `select 'Tables with EMPLOYERID not checked here', count(*), count(*), 0
   from CAPTURE_DB.INFORMATION_SCHEMA.COLUMNS
   where COLUMN_NAME = 'EMPLOYERID' and TABLE_SCHEMA <> 'TEST_BASELINE'
     and TABLE_SCHEMA || '.' || TABLE_NAME not in ('ILR.EMPLOYER', ${EMPLOYER_REFERENCES.map(([t]) => `'${t}'`).join(', ')})`,
].join('\nunion all\n')

const connection = await connect()
let problems = 0
try {
  const rows = await execute(connection, TEST_FLAGS_QUERY)
  for (const r of rows) {
    const bad = Number(r.DIFFERENT) + Number(r.NO_LEARNER)
    problems += bad
    const byOrg = r.TABLE_NAME === 'LEARNER' || r.TABLE_NAME === 'EMPLOYER'
    console.log(`${bad ? 'FAIL' : 'ok  '} ${r.TABLE_NAME.padEnd(30)} ${String(r.ROWS_).padStart(5)} rows, ${r.DIFFERENT} with a different ISTESTDATA from the ${byOrg ? 'organisation' : "learner"}'s, ${r.NO_LEARNER} with no ${byOrg ? 'organisation' : 'learner'}`)
  }
  console.log('\nEmployer IDs:')
  for (const r of await execute(connection, EMPLOYER_REFERENCES_QUERY)) {
    const bad = Number(r.NO_EMPLOYER) + Number(r.OTHER_ORGANISATION)
    problems += bad
    console.log(r.TABLE_NAME.startsWith('Tables')
      ? `${bad ? 'FAIL' : 'ok  '} ${r.ROWS_} other table(s) with an EMPLOYERID column (add them to this check and check 4 of sql/test_reset_02_reset.sql)`
      : `${bad ? 'FAIL' : 'ok  '} ${r.TABLE_NAME.padEnd(30)} ${String(r.ROWS_).padStart(5)} rows, ${r.NO_EMPLOYER} with no such employer, ${r.OTHER_ORGANISATION} with another organisation's employer`)
  }
} finally {
  await destroy(connection)
}
console.log(problems ? `\n${problems} row(s) don't match.` : '\nEvery row matches its learner (or organisation), and every employer ID is one of its organisation\'s employers.')
process.exit(problems ? 1 : 0)
