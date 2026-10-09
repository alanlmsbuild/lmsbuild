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
//   6. It owns or can create anything in SHARED_DB (the shared database:
//      REF, SKILLS, EXT, RAW, ACCESS, OPS; all owned by ACCOUNTADMIN), or
//      is missing a grant the imports need (REQUIRED below).
//   7. It can do more than read in OPTIONS_DB (the school leavers app's
//      database: only the loaders write there), directly or through a
//      database role it holds; it can use LOAD_WH; or it, or the app's user,
//      has DATA_LOAD_ROLE (sql/load_00_setup.sql). The live app's key must
//      never be able to write to OPTIONS_DB.
//   8. DATA_LOAD_ROLE, checked as DATA_LOAD_USER, has anything on ACCESS, on
//      the ILR tables or on the test snapshot of them in TEST_BASELINE; can
//      delete, truncate, own or create anything; or DATA_LOAD_USER has any
//      role but DATA_LOAD_ROLE.
// Needs the Snowflake connection in server/.env, and the loaders' key
// (DATA_LOAD_PRIVATE_KEY_PATH) for 8.
//
// Usage:
//   npm run check:grants

import { connect, execute, destroy } from '../server/db.js'

const ROLE = 'ILR_APP_ROLE'
const LOAD_ROLE = 'DATA_LOAD_ROLE'
const LOAD_USER = process.env.DATA_LOAD_USERNAME || 'DATA_LOAD_USER'
// All the app may ever have in OPTIONS_DB.
const OPTIONS_READS = new Set(['USAGE', 'SELECT', 'REFERENCES'])
const WRITES = new Set(['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
// ACCESS tables the app may write (none until part 8).
const ACCESS_WRITABLE = new Set([])
const ADD_ONLY = new Set([
  'CAPTURE_DB.ILR.RECORD_CHANGE',
  'CAPTURE_DB.BURROW.EVIDENCE_REVIEW',
  'CAPTURE_DB.BURROW.IQA_CHECK',
  'CAPTURE_DB.BURROW.WITNESS_CONFIRMATION',
  'SHARED_DB.RAW.CH_COMPANY_PROFILE',
  'SHARED_DB.EXT.COMPANY_CHANGE',
])
// Grants the app needs on the RAW and EXT tables (sql/employers_01_companies_house.sql).
const REQUIRED = {
  'SHARED_DB.RAW.CH_COMPANY_PROFILE': ['INSERT'],
  'SHARED_DB.EXT.COMPANY': ['SELECT', 'INSERT', 'UPDATE'],
  'SHARED_DB.EXT.COMPANY_CHANGE': ['SELECT', 'INSERT'],
  // Employer sites and contacts (sql/employers_03_sites_contacts.sql). The
  // site assignments are in ACCESS, so read-only like the rest of it.
  'CAPTURE_DB.ILR.EMPLOYER_SITE': ['SELECT', 'INSERT', 'UPDATE'],
  'CAPTURE_DB.ILR.EMPLOYER_CONTACT': ['SELECT', 'INSERT', 'UPDATE'],
  'SHARED_DB.ACCESS.APP_USER_SITE': ['SELECT'],
  // Vacancies (sql/vacancies_01_tables.sql).
  'SHARED_DB.RAW.FAA_VACANCY_PAGE': ['INSERT'],
  'SHARED_DB.EXT.VACANCY': ['SELECT', 'INSERT', 'UPDATE'],
  'SHARED_DB.EXT.VACANCY_IMPORT_RUN': ['SELECT', 'INSERT', 'UPDATE'],
  'CAPTURE_DB.ILR.EMPLOYER_VACANCY': ['SELECT', 'INSERT', 'UPDATE'],
  // Skills England (sql/skills_01_tables.sql).
  'SHARED_DB.RAW.SE_STANDARD_VERSION': ['INSERT'],
  'SHARED_DB.RAW.SE_OCCUPATION': ['INSERT'],
  ...Object.fromEntries(['SKILLS_IMPORT_RUN', 'STANDARD_VERSION', 'STANDARD_KSB', 'STANDARD_DUTY', 'STANDARD_DUTY_KSB',
    'STANDARD_OPTION', 'STANDARD_DUTY_OPTION', 'OCCUPATION_PROFILE', 'OCCUPATION_SOC', 'OCCUPATION_TERM']
    .map((t) => [`SHARED_DB.SKILLS.${t}`, ['SELECT', 'INSERT', 'UPDATE']])),
  // Reference data (sql/shared_01_clone.sql): the import merges, never deletes.
  ...Object.fromEntries(['IMPORT_RUN', 'INTEREST_WORD', 'POSTCODE', 'SIC2007', 'SIC2007_TO_SIC2026', 'SOC2020_INDEX', 'SOC2020_SUB_UNIT_GROUP', 'SOC2020_UNIT_GROUP']
    .map((t) => [`SHARED_DB.REF.${t}`, ['SELECT', 'INSERT', 'UPDATE']])),
  'SHARED_DB.REF.REF_IMPORT_CSV': ['USAGE'],
  // Background job runs (sql/jobs_01_job_run.sql).
  'SHARED_DB.OPS.JOB_RUN': ['SELECT', 'INSERT', 'UPDATE'],
}

// The problems in a list of grants (from SHOW GRANTS TO ROLE) and future
// grants on ACCESS (from SHOW FUTURE GRANTS IN SCHEMA). Exported so it can be
// tried on made-up grants.
// appUserRoles: SHOW GRANTS TO USER for the app's user. grants should
// include the grants of any OPTIONS_DB database role the app holds.
export function grantProblems(grants, futureAccessGrants, futureLayerGrants = [], appUserRoles = []) {
  const problems = []
  for (const g of grants) {
    const name = String(g.name)
    const privilege = String(g.privilege)
    if (/^CAPTURE_DB\.TEST_BASELINE(\.|$)/.test(name)) problems.push(`${privilege} on ${name}: the app must not reach the test snapshot`)
    if (g.granted_on === 'TABLE' && name.startsWith('SHARED_DB.ACCESS.') && WRITES.has(privilege) && !ACCESS_WRITABLE.has(name)) {
      problems.push(`${privilege} on ${name}: ACCESS is read-only for the app`)
    }
    if (privilege === 'DELETE' || privilege === 'TRUNCATE') problems.push(`${privilege} on ${name}: the app never deletes`)
    if (privilege === 'OWNERSHIP' && /^SHARED_DB(\.|$)/.test(name)) {
      problems.push(`OWNERSHIP of ${name}: everything in SHARED_DB is owned by ACCOUNTADMIN, so the app can't drop or change it`)
    }
    if (privilege.startsWith('CREATE') && /^SHARED_DB(\.|$)/.test(name)) {
      problems.push(`${privilege} on ${name}: the app can't create anything in SHARED_DB`)
    }
    if (privilege === 'UPDATE' && ADD_ONLY.has(name)) problems.push(`UPDATE on ${name}: it is add-only`)
    if (g.granted_on === 'TABLE' && name.startsWith('SHARED_DB.RAW.') && privilege !== 'INSERT') {
      problems.push(`${privilege} on ${name}: the app only adds to RAW`)
    }
    if (/^OPTIONS_DB(\.|$)/.test(name) && !OPTIONS_READS.has(privilege)) {
      problems.push(`${privilege} on ${name}: the app only reads OPTIONS_DB; the loaders write it`)
    }
    if (name === 'LOAD_WH') problems.push(`${privilege} on LOAD_WH: the load warehouse is for DATA_LOAD_ROLE only`)
    if (g.granted_on === 'ROLE' && name === LOAD_ROLE) problems.push(`${ROLE} has ${LOAD_ROLE}: the app could write to OPTIONS_DB`)
  }
  for (const r of appUserRoles) {
    if (String(r.role) === LOAD_ROLE) problems.push(`The app's user ${r.grantee_name} has ${LOAD_ROLE}: the app's key could write to OPTIONS_DB`)
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
    if (WRITES.has(String(g.privilege))) problems.push(`${g.privilege} on future tables in SHARED_DB.ACCESS: new ACCESS tables would be writable`)
  }
  return problems
}

// The problems in DATA_LOAD_ROLE's grants (SHOW GRANTS TO ROLE, as
// DATA_LOAD_USER) and DATA_LOAD_USER's roles (SHOW GRANTS TO USER).
// snapshotNames: the ILR and ACCESS table names, whose test copies in
// CAPTURE_DB.TEST_BASELINE the loaders must not reach either.
export function loaderGrantProblems(grants, userRoles, snapshotNames = new Set()) {
  const problems = []
  for (const g of grants) {
    const name = String(g.name)
    const privilege = String(g.privilege)
    if (/^SHARED_DB\.ACCESS(\.|$)/.test(name)) problems.push(`${privilege} on ${name}: ${LOAD_ROLE} has nothing on ACCESS`)
    if (/^CAPTURE_DB\.ILR(\.|$)/.test(name)) problems.push(`${privilege} on ${name}: ${LOAD_ROLE} has nothing on the ILR tables`)
    const m = name.match(/^CAPTURE_DB\.TEST_BASELINE\.(.+)$/)
    if (m && snapshotNames.has(m[1])) problems.push(`${privilege} on ${name}: ${LOAD_ROLE} can't reach the test learner snapshot`)
    if (['DELETE', 'TRUNCATE', 'OWNERSHIP'].includes(privilege) || privilege.startsWith('CREATE')) {
      problems.push(`${privilege} on ${name}: the loaders add rows to tables made by ACCOUNTADMIN; they never delete, own or create`)
    }
  }
  for (const r of userRoles) {
    if (String(r.role) !== LOAD_ROLE) problems.push(`${LOAD_USER} also has ${r.role}: it should have ${LOAD_ROLE} only`)
  }
  if (!userRoles.some((r) => String(r.role) === LOAD_ROLE)) problems.push(`${LOAD_USER} doesn't have ${LOAD_ROLE}`)
  return problems
}

let problems = []
let checked = 0
if (process.argv[1]?.endsWith('check-grants.js')) {
  let snapshotNames = new Set()
  const connection = await connect()
  try {
    const grants = await execute(connection, `show grants to role ${ROLE}`)
    const future = await execute(connection, 'show future grants in schema SHARED_DB.ACCESS')
    const layers = [
      ...(await execute(connection, 'show future grants in schema SHARED_DB.RAW')),
      ...(await execute(connection, 'show future grants in schema SHARED_DB.EXT')),
    ]
    // A database role in OPTIONS_DB (Warren reading CLEAN, later) carries
    // grants of its own: check those as if they were the app's.
    for (const g of grants.filter((x) => x.granted_on === 'DATABASE_ROLE' && /^OPTIONS_DB\./.test(String(x.name)))) {
      grants.push(...(await execute(connection, `show grants to database role ${g.name}`)))
    }
    const appUserRoles = await execute(connection, `show grants to user ${process.env.SNOWFLAKE_USERNAME}`)
    snapshotNames = new Set([
      ...(await execute(connection, 'show tables in schema CAPTURE_DB.ILR')),
      ...(await execute(connection, 'show tables in schema SHARED_DB.ACCESS')),
    ].map((t) => String(t.name)))
    checked = grants.length + future.length + layers.length + appUserRoles.length
    problems = grantProblems(grants, future, layers, appUserRoles)
  } finally {
    await destroy(connection)
  }
  const loader = await connect({ as: 'loader' })
  try {
    const loaderGrants = await execute(loader, `show grants to role ${LOAD_ROLE}`)
    const loaderRoles = await execute(loader, `show grants to user ${LOAD_USER}`)
    checked += loaderGrants.length + loaderRoles.length
    problems.push(...loaderGrantProblems(loaderGrants, loaderRoles, snapshotNames))
  } finally {
    await destroy(loader)
  }
  for (const p of problems) console.log(`FAIL ${p}`)
  console.log(problems.length
    ? `\n${problems.length} grant problem(s) for ${ROLE} or ${LOAD_ROLE}.`
    : `${checked} grants checked: ACCESS is read-only for ${ROLE}, it can't delete anything, the add-only tables stay add-only, RAW is insert-only, it owns and can create nothing in SHARED_DB, the Companies House, site, contact, vacancy, Skills England and job-run grants are in place, it can't reach the test snapshot, and it can only read OPTIONS_DB. ${LOAD_ROLE} belongs to ${LOAD_USER} alone, has nothing on ACCESS, ILR or the test snapshot, and can't delete, own or create anything.`)
  process.exit(problems.length ? 1 : 0)
}
