// check-grants.js - what the app's Snowflake role (ILR_APP_ROLE) is allowed
// to do, checked against what it should be allowed to do. Read-only: it asks
// Snowflake for the role's grants, as the app's own connection.
//
// Fails if:
//   1. ILR_APP_ROLE can INSERT, UPDATE, DELETE or TRUNCATE any ACCESS table,
//      or would get any of those on a future ACCESS table. The app only
//      reads users, roles and organisations (sql/access_03_app_read_only.sql,
//      run 4 October 2026). When part 8 adds screens to manage them, list
//      the tables it may write in ACCESS_WRITABLE below.
//   2. It can DELETE or TRUNCATE anything: the app never deletes (records
//      entered in error are marked removed instead).
//   3. It can UPDATE an add-only table: the history of changes and the
//      reviews, checks and confirmations behind evidence.
//   4. It has any access to CAPTURE_DB.TEST_BASELINE (the test snapshot).
//   5. It can do anything but INSERT on a RAW table (responses from outside
//      services, add-only; rebuilding EXT from them is an admin job), or has
//      future grants in RAW or EXT (those are granted table by table), or is
//      missing a grant the Companies House code needs (REQUIRED below).
//   6. It owns a table in SKILLS, RAW or EXT, or is missing a grant the
//      Skills England import needs (REQUIRED below).
// Needs the Snowflake connection in server/.env.
//
// Usage:
//   npm run check:grants

import { connect, execute, destroy } from '../server/db.js'

const ROLE = 'ILR_APP_ROLE'
const WRITES = new Set(['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
// ACCESS tables the app may write (none until part 8).
const ACCESS_WRITABLE = new Set([])
const ADD_ONLY = new Set([
  'CAPTURE_DB.ILR.RECORD_CHANGE',
  'CAPTURE_DB.BURROW.EVIDENCE_REVIEW',
  'CAPTURE_DB.BURROW.IQA_CHECK',
  'CAPTURE_DB.BURROW.WITNESS_CONFIRMATION',
  'CAPTURE_DB.RAW.CH_COMPANY_PROFILE',
  'CAPTURE_DB.EXT.COMPANY_CHANGE',
])
// Grants the app needs on the RAW and EXT tables (sql/employers_01_companies_house.sql).
const REQUIRED = {
  'CAPTURE_DB.RAW.CH_COMPANY_PROFILE': ['INSERT'],
  'CAPTURE_DB.EXT.COMPANY': ['SELECT', 'INSERT', 'UPDATE'],
  'CAPTURE_DB.EXT.COMPANY_CHANGE': ['SELECT', 'INSERT'],
  // Employer sites and contacts (sql/employers_03_sites_contacts.sql). The
  // site assignments are in ACCESS, so read-only like the rest of it.
  'CAPTURE_DB.ILR.EMPLOYER_SITE': ['SELECT', 'INSERT', 'UPDATE'],
  'CAPTURE_DB.ILR.EMPLOYER_CONTACT': ['SELECT', 'INSERT', 'UPDATE'],
  'CAPTURE_DB.ACCESS.APP_USER_SITE': ['SELECT'],
  // Vacancies (sql/vacancies_01_tables.sql).
  'CAPTURE_DB.RAW.FAA_VACANCY_PAGE': ['INSERT'],
  'CAPTURE_DB.EXT.VACANCY': ['SELECT', 'INSERT', 'UPDATE'],
  'CAPTURE_DB.EXT.VACANCY_IMPORT_RUN': ['SELECT', 'INSERT', 'UPDATE'],
  'CAPTURE_DB.ILR.EMPLOYER_VACANCY': ['SELECT', 'INSERT', 'UPDATE'],
  // Skills England (sql/skills_01_tables.sql).
  'CAPTURE_DB.RAW.SE_STANDARD_VERSION': ['INSERT'],
  'CAPTURE_DB.RAW.SE_OCCUPATION': ['INSERT'],
  ...Object.fromEntries(['SKILLS_IMPORT_RUN', 'STANDARD_VERSION', 'STANDARD_KSB', 'STANDARD_DUTY', 'STANDARD_DUTY_KSB',
    'STANDARD_OPTION', 'STANDARD_DUTY_OPTION', 'OCCUPATION_PROFILE', 'OCCUPATION_SOC', 'OCCUPATION_TERM']
    .map((t) => [`CAPTURE_DB.SKILLS.${t}`, ['SELECT', 'INSERT', 'UPDATE']])),
}

// The problems in a list of grants (from SHOW GRANTS TO ROLE) and future
// grants on ACCESS (from SHOW FUTURE GRANTS IN SCHEMA). Exported so it can be
// tried on made-up grants.
export function grantProblems(grants, futureAccessGrants, futureLayerGrants = []) {
  const problems = []
  for (const g of grants) {
    const name = String(g.name)
    const privilege = String(g.privilege)
    if (/^CAPTURE_DB\.TEST_BASELINE(\.|$)/.test(name)) problems.push(`${privilege} on ${name}: the app must not reach the test snapshot`)
    if (g.granted_on === 'TABLE' && name.startsWith('CAPTURE_DB.ACCESS.') && WRITES.has(privilege) && !ACCESS_WRITABLE.has(name)) {
      problems.push(`${privilege} on ${name}: ACCESS is read-only for the app`)
    }
    if (privilege === 'DELETE' || privilege === 'TRUNCATE') problems.push(`${privilege} on ${name}: the app never deletes`)
    if (privilege === 'OWNERSHIP' && /^CAPTURE_DB\.(SKILLS|RAW|EXT)\./.test(name)) {
      problems.push(`OWNERSHIP of ${name}: tables there are owned by ACCOUNTADMIN, so the app can't drop or change them`)
    }
    if (privilege === 'UPDATE' && ADD_ONLY.has(name)) problems.push(`UPDATE on ${name}: it is add-only`)
    if (g.granted_on === 'TABLE' && name.startsWith('CAPTURE_DB.RAW.') && privilege !== 'INSERT') {
      problems.push(`${privilege} on ${name}: the app only adds to RAW`)
    }
  }
  for (const [name, privileges] of Object.entries(REQUIRED)) {
    for (const privilege of privileges) {
      if (!grants.some((g) => String(g.name) === name && String(g.privilege) === privilege)) problems.push(`${privilege} on ${name} is missing: the app needs it`)
    }
  }
  for (const g of futureLayerGrants.filter((x) => x.grantee_name === ROLE)) {
    problems.push(`${g.privilege} on future ${g.grant_on} in ${g.name}: RAW and EXT are granted table by table`)
  }
  for (const g of futureAccessGrants.filter((x) => x.grantee_name === ROLE)) {
    if (WRITES.has(String(g.privilege))) problems.push(`${g.privilege} on future tables in CAPTURE_DB.ACCESS: new ACCESS tables would be writable`)
  }
  return problems
}

let problems = []
let checked = 0
if (process.argv[1]?.endsWith('check-grants.js')) {
  const connection = await connect()
  try {
    const grants = await execute(connection, `show grants to role ${ROLE}`)
    const future = await execute(connection, 'show future grants in schema CAPTURE_DB.ACCESS')
    const layers = [
      ...(await execute(connection, 'show future grants in schema CAPTURE_DB.RAW')),
      ...(await execute(connection, 'show future grants in schema CAPTURE_DB.EXT')),
    ]
    checked = grants.length + future.length + layers.length
    problems = grantProblems(grants, future, layers)
  } finally {
    await destroy(connection)
  }
  for (const p of problems) console.log(`FAIL ${p}`)
  console.log(problems.length
    ? `\n${problems.length} grant problem(s) for ${ROLE}.`
    : `${checked} grants checked: ACCESS is read-only for ${ROLE}, it can't delete anything, the add-only tables stay add-only, RAW is insert-only, it owns nothing in SKILLS, RAW or EXT, the Companies House, site, contact, vacancy and Skills England grants are in place, and it can't reach the test snapshot.`)
  process.exit(problems.length ? 1 : 0)
}
