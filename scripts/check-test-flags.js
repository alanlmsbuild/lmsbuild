// check-test-flags.js - every learner's records carry the learner's
// ISTESTDATA, so the test reset (sql/test_reset_02_reset.sql) finds all of
// a test learner's rows and never touches a real one.
//
// For each of the 12 tables the test snapshot covers (ILR.LEARNER is
// compared with its organisation) and ILR.RECORD_CHANGE, counts rows whose
// ISTESTDATA differs from their learner's, and rows with no learner at all.
// Every count should be 0. Read-only: counts only, no personal details.
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
].join('\nunion all\n')

const connection = await connect()
let problems = 0
try {
  const rows = await execute(connection, TEST_FLAGS_QUERY)
  for (const r of rows) {
    const bad = Number(r.DIFFERENT) + Number(r.NO_LEARNER)
    problems += bad
    console.log(`${bad ? 'FAIL' : 'ok  '} ${r.TABLE_NAME.padEnd(30)} ${String(r.ROWS_).padStart(5)} rows, ${r.DIFFERENT} with a different ISTESTDATA from the learner's${r.TABLE_NAME === 'LEARNER' ? ' organisation' : ''}, ${r.NO_LEARNER} with no ${r.TABLE_NAME === 'LEARNER' ? 'organisation' : 'learner'}`)
  }
} finally {
  await destroy(connection)
}
console.log(problems ? `\n${problems} row(s) don't match.` : '\nEvery row matches its learner.')
process.exit(problems ? 1 : 0)
