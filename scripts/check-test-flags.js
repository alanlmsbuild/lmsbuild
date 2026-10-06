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
  // A site has no organisation of its own: only that its employer exists.
  ['ILR.EMPLOYER_SITE', '', 'e.ORGANISATIONID', ''],
  // A contact with a Burrow sign-in: the sign-in's organisation.
  ['ILR.EMPLOYER_CONTACT', 'left join CAPTURE_DB.ACCESS.APP_USER u on u.USERID = t.USERID', 'coalesce(u.ORGANISATIONID, e.ORGANISATIONID)', ''],
]

// Sites, contacts and site assignments point within the same employer, and
// one person is one record. The same as check 5 in
// sql/test_reset_02_reset.sql.
const SITE_LINKS_QUERY = `
  select 'site contact at another employer' as PROBLEM, count(*) as N
  from CAPTURE_DB.ILR.EMPLOYER_SITE s join CAPTURE_DB.ILR.EMPLOYER_CONTACT c on c.CONTACTID = s.CONTACTID
  where c.EMPLOYERID <> s.EMPLOYERID
  union all select 'site contact that does not exist', count(*)
  from CAPTURE_DB.ILR.EMPLOYER_SITE s left join CAPTURE_DB.ILR.EMPLOYER_CONTACT c on c.CONTACTID = s.CONTACTID
  where s.CONTACTID is not null and c.CONTACTID is null
  union all select 'contact based at another employer''s site', count(*)
  from CAPTURE_DB.ILR.EMPLOYER_CONTACT c join CAPTURE_DB.ILR.EMPLOYER_SITE s on s.SITEID = c.SITEID
  where s.EMPLOYERID <> c.EMPLOYERID
  union all select 'apprentice at another employer''s site, or a site that does not exist', count(*)
  from CAPTURE_DB.ILR.LEARNER_EMPLOYER le left join CAPTURE_DB.ILR.EMPLOYER_SITE s on s.SITEID = le.SITEID
  where le.SITEID is not null and (s.SITEID is null or s.EMPLOYERID <> le.EMPLOYERID)
  union all select 'line manager at another employer, or not a contact', count(*)
  from CAPTURE_DB.ILR.LEARNER_EMPLOYER le left join CAPTURE_DB.ILR.EMPLOYER_CONTACT c on c.CONTACTID = le.LINEMANAGERCONTACTID
  where le.LINEMANAGERCONTACTID is not null and (c.CONTACTID is null or c.EMPLOYERID <> le.EMPLOYERID)
  union all select 'site assignment not at the user''s employer', count(*)
  from CAPTURE_DB.ACCESS.APP_USER_SITE a
  join CAPTURE_DB.ACCESS.APP_USER u on u.USERID = a.USERID
  left join CAPTURE_DB.ILR.EMPLOYER_SITE s on s.SITEID = a.SITEID
  where s.SITEID is null or s.EMPLOYERID is distinct from u.EMPLOYERID
  union all select 'contact and sign-in emails differ', count(*)
  from CAPTURE_DB.ILR.EMPLOYER_CONTACT c join CAPTURE_DB.ACCESS.APP_USER u on u.USERID = c.USERID
  where lower(c.EMAIL) is distinct from lower(u.EMAIL) or c.EMPLOYERID is distinct from u.EMPLOYERID
  union all select 'user with more than one contact', count(*)
  from (select USERID from CAPTURE_DB.ILR.EMPLOYER_CONTACT where USERID is not null group by USERID having count(*) > 1)
  union all select 'same email twice among an employer''s current contacts', count(*)
  from (select EMPLOYERID, lower(EMAIL) from CAPTURE_DB.ILR.EMPLOYER_CONTACT where ISCURRENT and EMAIL is not null
        group by 1, 2 having count(*) > 1)
  union all select 'apprentice links with the same learner, employer and start date', count(*)
  from (select LEARNREFNUMBER, EMPLOYERID, FROMDATE from CAPTURE_DB.ILR.LEARNER_EMPLOYER group by 1, 2, 3 having count(*) > 1)
  union all select 'head office with current site assignments', count(distinct u.USERID)
  from CAPTURE_DB.ACCESS.APP_USER u join CAPTURE_DB.ACCESS.APP_USER_SITE a on a.USERID = u.USERID and a.ENDEDAT is null
  where u.ISHEADOFFICE
`
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
  console.log('\nSites, contacts and site assignments:')
  for (const r of await execute(connection, SITE_LINKS_QUERY)) {
    problems += Number(r.N)
    console.log(`${Number(r.N) ? 'FAIL' : 'ok  '} ${r.N} ${r.PROBLEM}`)
  }
} finally {
  await destroy(connection)
}
console.log(problems ? `\n${problems} row(s) don't match.` : '\nEvery row matches its learner (or organisation), and every employer ID is one of its organisation\'s employers.')
process.exit(problems ? 1 : 0)
