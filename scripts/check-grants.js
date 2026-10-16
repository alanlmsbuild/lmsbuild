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
//      delete, truncate, own or create anything; is missing a grant the
//      vacancy import needs (LOAD_REQUIRED: it writes the vacancy tables and
//      their SOC codes, sql/vacancies_02_soc.sql; and the website link check,
//      sql/links_01_website_link.sql: WEBSITE_LINK_CHECK only added to); or
//      DATA_LOAD_USER has any
//      role but DATA_LOAD_ROLE. The app may only read the vacancy tables.
//   9. The two databases can't see each other (sql/crm_01_database.sql):
//      ILR_APP_ROLE (or the app's user) has anything in CRM_DB or holds
//      CRM_APP_ROLE or FLOW_OWNER; CRM_APP_ROLE, checked as CRM_APP_USER, has
//      anything in CAPTURE_DB or OPTIONS_DB, writes anything in SHARED_DB,
//      can delete, own or create anything, can UPDATE an add-only CRM table
//      or do more than INSERT into BRONZE, holds another role, or is missing
//      a grant the CRM needs (CRM_REQUIRED below); CRM_APP_USER has any role
//      but CRM_APP_ROLE. DATA_LOAD_ROLE has nothing in CRM_DB either. The
//      view log, CRM.RECORD_VIEW (sql/crm_02_record_view_tags.sql), is
//      INSERT only: the CRM can't read, change or remove it. The CRM has
//      USAGE on SHARED_DB.GOVERNANCE (to read tag values, check:tags --crm)
//      and no APPLY on any tag.
//  11. TRANSFORM_ROLE (dbt, the silver layer; sql/silver_01_setup.sql and
//      silver_02_staging.sql), checked as TRANSFORM_USER: it may only read
//      RAW (both databases) and the vacancy tables in EXT, make and own
//      tables and views in SILVER and SILVER_STAGING, apply the governance
//      tags, attach data metric functions (EXECUTE DATA METRIC FUNCTION on
//      the account, sql/silver_03_dmf.sql), log its runs in OPS.JOB_RUN and
//      use TRANSFORM_WH. Anything in
//      CAPTURE_DB, CRM_DB or ACCESS, any other write, any other role, or a
//      missing grant the job needs (TRANSFORM_REQUIRED) fails; so does
//      TRANSFORM_ROLE held by anyone but TRANSFORM_USER, or TRANSFORM_USER
//      holding any other role.
//  12. Each service role is held by its own service user and nothing else:
//      ILR_APP_ROLE by the app's user, DATA_LOAD_ROLE by DATA_LOAD_USER,
//      CRM_APP_ROLE by CRM_APP_USER, TRANSFORM_ROLE by TRANSFORM_USER (SHOW
//      GRANTS OF ROLE, each as its own user). Another user (a person's
//      login) or a role holding one fails (added 14 October 2026, after
//      CRM_APP_ROLE and TRANSFORM_ROLE were found granted to a person), but
//      for the named exceptions in ROLE_HOLDER_EXCEPTIONS (SYSADMIN holds
//      ILR_APP_ROLE, so ACCOUNTADMIN can reach the LARS tables the app owns).
//  13. Gold (sql/gold_01_setup.sql, scripts/gold-readers.js), as
//      TRANSFORM_USER: each reader database role (GOLD_WARREN, GOLD_MEADOW,
//      GOLD_SITE) uses only GOLD and selects exactly its own gold tables;
//      only TRANSFORM_ROLE creates in the gold schemas and owns or writes
//      gold tables; each reader is held only by its product's role.
//  10. The flows (sql/flow_01_f6_f7_f8.sql): each app role may call only
//      its own flow procedures (the CRM F6 and F8, Warren F7), and Warren
//      may read and update ILR.ONBOARDING but never add to it (only F6 does).
// Needs the Snowflake connection in server/.env, and the loaders', the
// CRM's and dbt's keys (DATA_LOAD_PRIVATE_KEY_PATH, CRM_PRIVATE_KEY_PATH,
// TRANSFORM_PRIVATE_KEY_PATH) for 8, 9 and 11.
//
// Usage:
//   npm run check:grants

import { connect, execute, destroy } from '../server/db.js'
import { GOLD_HOLDERS, GOLD_READERS, GOLD_SCHEMAS, GOLD_STAGING_SCHEMAS } from './gold-readers.js'

const ROLE = 'ILR_APP_ROLE'
const LOAD_ROLE = 'DATA_LOAD_ROLE'
const LOAD_USER = process.env.DATA_LOAD_USERNAME || 'DATA_LOAD_USER'
// All the app may ever have in OPTIONS_DB.
const OPTIONS_READS = new Set(['USAGE', 'SELECT', 'REFERENCES'])
const CRM_ROLE = 'CRM_APP_ROLE'
const CRM_USER = process.env.CRM_USERNAME || 'CRM_APP_USER'
// The CRM's tables by what the app may do to them (sql/crm_01_database.sql).
const CRM_READ_ONLY = ['PIPELINE', 'PIPELINE_STAGE', 'CLOSE_REASON']
const CRM_ADD_ONLY = ['LEAD_CONSENT', 'STAGE_CHANGE', 'ACTIVITY_LINK', 'RECORD_CHANGE']
// Insert only: the CRM adds to these but can't read them back.
const CRM_INSERT_ONLY = ['RECORD_VIEW']
const CRM_CHANGEABLE = ['LEAD', 'LEAD_INTEREST', 'CONFIRM_TOKEN', 'LEAD_MATCH', 'EMAIL_MESSAGE', 'EMPLOYER', 'EMPLOYER_SITE', 'CONTACT',
  'PIPELINE_ITEM', 'PLACEMENT', 'ACTIVITY', 'TASK']
const CRM_SHARED_READS = [
  ...['POSTCODE', 'SIC2007', 'SIC2007_TO_SIC2026', 'SOC2020_INDEX', 'SOC2020_SUB_UNIT_GROUP', 'SOC2020_UNIT_GROUP', 'INTEREST_WORD'].map((t) => `SHARED_DB.REF.${t}`),
  ...['STANDARD_VERSION', 'STANDARD_KSB', 'STANDARD_DUTY', 'STANDARD_DUTY_KSB', 'STANDARD_OPTION', 'STANDARD_DUTY_OPTION', 'OCCUPATION_PROFILE',
    'OCCUPATION_SOC', 'OCCUPATION_TERM'].map((t) => `SHARED_DB.SKILLS.${t}`),
  'SHARED_DB.EXT.VACANCY',
  'SHARED_DB.EXT.VACANCY_SOC',
  ...['APP_USER', 'APP_USER_SITE', 'ORGANISATION', 'USER_ROLE'].map((t) => `SHARED_DB.ACCESS.${t}`),
]
const CRM_REQUIRED = {
  'CRM_DB.BRONZE.FORM_SUBMISSION': ['INSERT'],
  ...Object.fromEntries(CRM_READ_ONLY.map((t) => [`CRM_DB.CRM.${t}`, ['SELECT']])),
  ...Object.fromEntries(CRM_ADD_ONLY.map((t) => [`CRM_DB.CRM.${t}`, ['SELECT', 'INSERT']])),
  ...Object.fromEntries(CRM_CHANGEABLE.map((t) => [`CRM_DB.CRM.${t}`, ['SELECT', 'INSERT', 'UPDATE']])),
  ...Object.fromEntries(CRM_INSERT_ONLY.map((t) => [`CRM_DB.CRM.${t}`, ['INSERT']])),
  ...Object.fromEntries(CRM_SHARED_READS.map((t) => [t, ['SELECT']])),
  'SHARED_DB.GOVERNANCE': ['USAGE'],
}
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
  // Vacancies (sql/vacancies_01_tables.sql): the app reads them; since
  // sql/vacancies_02_soc.sql the import writes them as DATA_LOAD_USER.
  'SHARED_DB.EXT.VACANCY': ['SELECT'],
  'SHARED_DB.EXT.VACANCY_IMPORT_RUN': ['SELECT'],
  'SHARED_DB.EXT.VACANCY_SOC': ['SELECT'],
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
  // Onboarding, made by F6 (sql/flow_01_f6_f7_f8.sql).
  'CAPTURE_DB.ILR.ONBOARDING': ['SELECT', 'UPDATE'],
}
// The flow procedures each app role calls (sql/flow_01_f6_f7_f8.sql),
// matched on their names as SHOW GRANTS gives them.
const FLOWS = { F6: /\.FLOW\."?F6_HANDOVER\(/, F7: /\.FLOW\."?F7_ONBOARDING_STATUS\(/, F8: /\.FLOW\."?F8_WON_EMPLOYER\(/ }
const flowProblems = (role, grants, own) => {
  const problems = []
  for (const [flow, re] of Object.entries(FLOWS)) {
    const has = grants.some((g) => g.granted_on === 'PROCEDURE' && String(g.privilege) === 'USAGE' && re.test(String(g.name)))
    if (own.includes(flow) && !has) problems.push(`USAGE on flow ${flow} is missing: ${role} calls it`)
    if (!own.includes(flow) && has) problems.push(`USAGE on flow ${flow}: ${role} doesn't call it`)
  }
  return problems
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
    if (VACANCY_IMPORT_TABLES.includes(name) && privilege !== 'SELECT') {
      problems.push(`${privilege} on ${name}: the vacancy import writes it as ${LOAD_ROLE}; the app only reads it`)
    }
    if (g.granted_on === 'TABLE' && name.startsWith('SHARED_DB.RAW.') && privilege !== 'INSERT') {
      problems.push(`${privilege} on ${name}: the app only adds to RAW`)
    }
    if (/^OPTIONS_DB(\.|$)/.test(name) && !OPTIONS_READS.has(privilege)) {
      problems.push(`${privilege} on ${name}: the app only reads OPTIONS_DB; the loaders write it`)
    }
    if (name === 'LOAD_WH') problems.push(`${privilege} on LOAD_WH: the load warehouse is for DATA_LOAD_ROLE only`)
    if (g.granted_on === 'ROLE' && name === LOAD_ROLE) problems.push(`${ROLE} has ${LOAD_ROLE}: the app could write to OPTIONS_DB`)
    if (/^CRM_DB(\.|$)/.test(name)) problems.push(`${privilege} on ${name}: Warren and Burrow's role has no access to the CRM's database`)
    if (g.granted_on === 'ROLE' && [CRM_ROLE, 'FLOW_OWNER'].includes(name)) problems.push(`${ROLE} has ${name}: it could reach the CRM's database`)
  }
  for (const r of appUserRoles) {
    if (String(r.role) === LOAD_ROLE) problems.push(`The app's user ${r.grantee_name} has ${LOAD_ROLE}: the app's key could write to OPTIONS_DB`)
    if ([CRM_ROLE, 'FLOW_OWNER'].includes(String(r.role))) problems.push(`The app's user ${r.grantee_name} has ${r.role}: the app's key could reach the CRM's database`)
  }
  for (const [name, privileges] of Object.entries(REQUIRED)) {
    for (const privilege of privileges) {
      if (!grants.some((g) => String(g.name) === name && String(g.privilege) === privilege)) problems.push(`${privilege} on ${name} is missing: the app needs it`)
    }
  }
  problems.push(...flowProblems(ROLE, grants, ['F7']))
  if (grants.some((g) => String(g.name) === 'CAPTURE_DB.ILR.ONBOARDING' && String(g.privilege) === 'INSERT')) {
    problems.push('INSERT on CAPTURE_DB.ILR.ONBOARDING: only hand-over (F6) adds onboarding records')
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
// The vacancy tables only the import writes (as DATA_LOAD_USER): the app
// reads them and nothing more.
const VACANCY_IMPORT_TABLES = ['SHARED_DB.RAW.FAA_VACANCY_PAGE', 'SHARED_DB.EXT.VACANCY', 'SHARED_DB.EXT.VACANCY_IMPORT_RUN', 'SHARED_DB.EXT.VACANCY_SOC']
// Grants the loaders need beyond their RAW tables: the vacancy import, and
// the SOC coding of adverts it does (sql/vacancies_02_soc.sql).
export const LOAD_REQUIRED = {
  'SHARED_DB.RAW.FAA_VACANCY_PAGE': ['SELECT', 'INSERT'],
  'SHARED_DB.EXT.VACANCY': ['SELECT', 'INSERT', 'UPDATE'],
  'SHARED_DB.EXT.VACANCY_IMPORT_RUN': ['SELECT', 'INSERT', 'UPDATE'],
  'SHARED_DB.EXT.VACANCY_SOC': ['SELECT', 'INSERT', 'UPDATE'],
  // The website link check (sql/links_01_website_link.sql).
  'SHARED_DB.EXT.WEBSITE_LINK': ['SELECT', 'INSERT', 'UPDATE'],
  'SHARED_DB.EXT.WEBSITE_LINK_CHECK': ['SELECT', 'INSERT'],
  'SHARED_DB.REF.SOC2020_INDEX': ['SELECT'],
  ...Object.fromEntries(['STANDARD_VERSION', 'STANDARD_OPTION', 'OCCUPATION_SOC'].map((t) => [`SHARED_DB.SKILLS.${t}`, ['SELECT']])),
}

export function loaderGrantProblems(grants, userRoles, snapshotNames = new Set()) {
  const problems = []
  for (const [name, privileges] of Object.entries(LOAD_REQUIRED)) {
    for (const privilege of privileges) {
      if (!grants.some((g) => String(g.name) === name && String(g.privilege) === privilege)) problems.push(`${privilege} on ${name} is missing: the vacancy import needs it`)
    }
  }
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
    if (/^CRM_DB(\.|$)/.test(name)) problems.push(`${privilege} on ${name}: ${LOAD_ROLE} has nothing in the CRM's database`)
    if (name === 'SHARED_DB.EXT.WEBSITE_LINK_CHECK' && !['SELECT', 'INSERT'].includes(privilege)) problems.push(`${privilege} on ${name}: the link check history is add-only`)
  }
  for (const r of userRoles) {
    if (String(r.role) !== LOAD_ROLE) problems.push(`${LOAD_USER} also has ${r.role}: it should have ${LOAD_ROLE} only`)
  }
  if (!userRoles.some((r) => String(r.role) === LOAD_ROLE)) problems.push(`${LOAD_USER} doesn't have ${LOAD_ROLE}`)
  return problems
}

// The problems in CRM_APP_ROLE's grants (SHOW GRANTS TO ROLE, as
// CRM_APP_USER) and CRM_APP_USER's roles (SHOW GRANTS TO USER).
export function crmGrantProblems(grants, userRoles) {
  const problems = []
  for (const g of grants) {
    const name = String(g.name)
    const privilege = String(g.privilege)
    const db = name.split('.')[0]
    if (db === 'CAPTURE_DB') problems.push(`${privilege} on ${name}: the CRM's role has no access to the learning database`)
    if (db === 'OPTIONS_DB') problems.push(`${privilege} on ${name}: the CRM's role has nothing in OPTIONS_DB`)
    if (db === 'SHARED_DB' && !['USAGE', 'SELECT'].includes(privilege)) problems.push(`${privilege} on ${name}: the CRM reads shared data, it never writes it`)
    if (['DELETE', 'TRUNCATE', 'OWNERSHIP'].includes(privilege) || privilege.startsWith('CREATE')) problems.push(`${privilege} on ${name}: the CRM never deletes, owns or creates`)
    if (privilege === 'UPDATE' && CRM_ADD_ONLY.some((t) => name === `CRM_DB.CRM.${t}`)) problems.push(`UPDATE on ${name}: it is add-only`)
    if (['INSERT', 'UPDATE'].includes(privilege) && CRM_READ_ONLY.some((t) => name === `CRM_DB.CRM.${t}`)) problems.push(`${privilege} on ${name}: pipelines, stages and close reasons are read-only for the app`)
    if (g.granted_on === 'TABLE' && name.startsWith('CRM_DB.BRONZE.') && privilege !== 'INSERT') problems.push(`${privilege} on ${name}: the app only adds to BRONZE`)
    if (privilege !== 'INSERT' && CRM_INSERT_ONLY.some((t) => name === `CRM_DB.CRM.${t}`)) problems.push(`${privilege} on ${name}: the view log is insert only`)
    if (privilege === 'APPLY') problems.push(`APPLY on ${name}: the CRM reads tags, it never sets them`)
    if (g.granted_on === 'ROLE') problems.push(`${CRM_ROLE} holds ${name}: it should hold no other role`)
  }
  for (const [name, privileges] of Object.entries(CRM_REQUIRED)) {
    for (const privilege of privileges) {
      if (!grants.some((g) => String(g.name) === name && String(g.privilege) === privilege)) problems.push(`${privilege} on ${name} is missing: the CRM needs it`)
    }
  }
  problems.push(...flowProblems(CRM_ROLE, grants, ['F6', 'F8']))
  for (const r of userRoles) {
    if (String(r.role) !== CRM_ROLE) problems.push(`${CRM_USER} also has ${r.role}: it should have ${CRM_ROLE} only`)
  }
  if (!userRoles.some((r) => String(r.role) === CRM_ROLE)) problems.push(`${CRM_USER} doesn't have ${CRM_ROLE}`)
  return problems
}

// dbt's role: what it may have, and what the transform job needs.
const TRANSFORM_ROLE = 'TRANSFORM_ROLE'
const TRANSFORM_USER = process.env.TRANSFORM_USERNAME || 'TRANSFORM_USER'
const SILVER_SCHEMAS = ['SHARED_DB.SILVER', 'SHARED_DB.SILVER_STAGING', 'OPTIONS_DB.SILVER', 'OPTIONS_DB.SILVER_STAGING']
// What dbt builds and owns: silver and gold, each with its staging schema.
const BUILT_SCHEMAS = [...SILVER_SCHEMAS, ...GOLD_SCHEMAS, ...GOLD_STAGING_SCHEMAS]
const TRANSFORM_READ_SCHEMAS = ['SHARED_DB.RAW', 'OPTIONS_DB.RAW', 'SHARED_DB.EXT']
const TRANSFORM_USAGE_SCHEMAS = [...TRANSFORM_READ_SCHEMAS, ...BUILT_SCHEMAS, 'SHARED_DB.GOVERNANCE', 'SHARED_DB.OPS']
const TAG_NAMES = ['LAYER', 'SOURCE', 'LICENCE', 'ATTRIBUTION', 'OWNER', 'REFRESH', 'SENSITIVITY']
export const TRANSFORM_REQUIRED = {
  'SHARED_DB.OPS.JOB_RUN': ['SELECT', 'INSERT', 'UPDATE'],
  TRANSFORM_WH: ['USAGE'],
  ...Object.fromEntries(BUILT_SCHEMAS.map((x) => [x, ['USAGE', 'CREATE TABLE']])),
  'SHARED_DB.GOVERNANCE': ['USAGE', 'CREATE DATA METRIC FUNCTION'],
  ...Object.fromEntries(TAG_NAMES.map((t) => [`SHARED_DB.GOVERNANCE.${t}`, ['APPLY']])),
  'SHARED_DB.EXT.VACANCY': ['SELECT'],
  'SHARED_DB.EXT.VACANCY_SOC': ['SELECT'],
  'SHARED_DB.EXT.WEBSITE_LINK': ['SELECT'],
}
const inSchema = (name, schemas) => schemas.some((x) => name.startsWith(`${x}.`))

// The problems in TRANSFORM_ROLE's grants (SHOW GRANTS TO ROLE, as
// TRANSFORM_USER), TRANSFORM_USER's roles and who holds TRANSFORM_ROLE.
export function transformGrantProblems(grants, userRoles, holders) {
  const problems = []
  for (const g of grants) {
    const name = String(g.name)
    const privilege = String(g.privilege)
    const on = String(g.granted_on)
    const what = `${privilege} on ${on.toLowerCase()} ${name}`
    const db = name.split('.')[0]
    if (db === 'CAPTURE_DB' || db === 'CRM_DB') { problems.push(`${what}: ${TRANSFORM_ROLE} has nothing in ${db}`); continue }
    if (/^SHARED_DB\.ACCESS(\.|$)/.test(name)) { problems.push(`${what}: ${TRANSFORM_ROLE} has nothing on ACCESS`); continue }
    let ok = false
    if (on === 'DATABASE') ok = privilege === 'USAGE' && ['SHARED_DB', 'OPTIONS_DB'].includes(name)
    else if (on === 'SCHEMA') ok = (privilege === 'USAGE' && TRANSFORM_USAGE_SCHEMAS.includes(name)) || (['CREATE TABLE', 'CREATE VIEW'].includes(privilege) && BUILT_SCHEMAS.includes(name)) ||
      (privilege === 'CREATE DATA METRIC FUNCTION' && name === 'SHARED_DB.GOVERNANCE')
    else if (on === 'TABLE' || on === 'VIEW') {
      ok = (privilege === 'SELECT' && inSchema(name, TRANSFORM_READ_SCHEMAS)) ||
        (privilege === 'OWNERSHIP' && inSchema(name, BUILT_SCHEMAS)) ||
        (name === 'SHARED_DB.OPS.JOB_RUN' && ['SELECT', 'INSERT', 'UPDATE'].includes(privilege))
    } else if (on === 'DYNAMIC_TABLE' || on === 'MATERIALIZED_VIEW') {
      // Snowflake makes one of these, named by an ID, for each table whose
      // data metric functions run on TRIGGER_ON_CHANGES (a dynamic table,
      // seen 14 October 2026), and a materialized view for each table with
      // our own metric, SHOWN_BASE_UNDER_10 (seen 15 October 2026; hidden
      // from SHOW; scripts/data-quality.js). Each is owned by the table's
      // owner.
      ok = privilege === 'OWNERSHIP' && BUILT_SCHEMAS.some((x) => new RegExp(`^${x.replace('.', '\\.')}\\."[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"$`).test(name))
    } else if (on === 'TAG') ok = privilege === 'APPLY' && name.startsWith('SHARED_DB.GOVERNANCE.')
    else if (on === 'WAREHOUSE') ok = privilege === 'USAGE' && name === 'TRANSFORM_WH'
    else if (on === 'ACCOUNT') ok = privilege === 'EXECUTE DATA METRIC FUNCTION'
    // Its own data metric functions (the gold "shown with a base under 10" one).
    else if (on === 'DATA_METRIC_FUNCTION' || on === 'FUNCTION') ok = privilege === 'OWNERSHIP' && name.startsWith('SHARED_DB.GOVERNANCE.')
    if (!ok) problems.push(`${what}: ${TRANSFORM_ROLE} only reads RAW and EXT, writes SILVER, GOLD and their staging schemas, applies the tags and logs its runs`)
  }
  if (!grants.some((g) => String(g.granted_on) === 'ACCOUNT' && String(g.privilege) === 'EXECUTE DATA METRIC FUNCTION')) problems.push('EXECUTE DATA METRIC FUNCTION on the account is missing: the transform job attaches the data metric functions (sql/silver_03_dmf.sql)')
  for (const [name, privileges] of Object.entries(TRANSFORM_REQUIRED)) {
    for (const privilege of privileges) {
      if (!grants.some((g) => String(g.name) === name && String(g.privilege) === privilege)) problems.push(`${privilege} on ${name} is missing: the transform job needs it`)
    }
  }
  for (const r of userRoles) {
    if (String(r.role) !== TRANSFORM_ROLE) problems.push(`${TRANSFORM_USER} also has ${r.role}: it should have ${TRANSFORM_ROLE} only`)
  }
  if (!userRoles.some((r) => String(r.role) === TRANSFORM_ROLE)) problems.push(`${TRANSFORM_USER} doesn't have ${TRANSFORM_ROLE}`)
  problems.push(...roleHolderProblems(TRANSFORM_ROLE, holders, TRANSFORM_USER))
  return problems
}

// The problems in gold's readers (rule 13), as TRANSFORM_USER:
//   readerGrants  { role: SHOW GRANTS TO DATABASE ROLE rows }
//   holders       { role: SHOW GRANTS OF DATABASE ROLE rows }
//   schemaGrants  { schema: SHOW GRANTS ON SCHEMA rows } for GOLD and GOLD_STAGING
//   tableGrants   { 'DB.GOLD.T': SHOW GRANTS ON TABLE rows } for every gold table
// Each reader may use its own database and GOLD (never GOLD_STAGING) and
// select exactly its tables in GOLD_READERS that exist; nothing else. Only
// TRANSFORM_ROLE may create in the gold schemas or own or write a gold
// table; a gold table's only other grants are SELECT to its readers. Each
// reader is held only by the roles in GOLD_HOLDERS.
export function goldProblems({ readerGrants, holders, schemaGrants, tableGrants }) {
  const problems = []
  const existing = new Set(Object.keys(tableGrants))
  for (const [role, grants] of Object.entries(readerGrants)) {
    const db = role.split('.')[0]
    const want = new Set(GOLD_READERS[role].map((t) => `${db}.GOLD.${t}`).filter((t) => existing.has(t)))
    const have = new Set()
    for (const g of grants) {
      const name = String(g.name)
      const privilege = String(g.privilege)
      const on = String(g.granted_on)
      if (on === 'DATABASE' && privilege === 'USAGE' && name === db) continue
      if (on === 'SCHEMA' && privilege === 'USAGE' && name === `${db}.GOLD`) continue
      // Built and granted in GOLD_STAGING before the swap: unreadable there (no USAGE).
      if (on === 'TABLE' && privilege === 'SELECT' && name.startsWith(`${db}.GOLD_STAGING.`) && GOLD_READERS[role].includes(name.split('.').at(-1))) continue
      if (on === 'TABLE' && privilege === 'SELECT' && name.startsWith(`${db}.GOLD.`)) {
        have.add(name)
        if (!want.has(name)) problems.push(`${role} can read ${name}: not one of its gold tables (scripts/gold-readers.js)`)
        continue
      }
      problems.push(`${role} has ${privilege} on ${on.toLowerCase()} ${name}: a gold reader only reads its own GOLD tables`)
    }
    for (const t of want) if (!have.has(t)) problems.push(`${role} can't read ${t}: it should (scripts/gold-readers.js)`)
  }
  for (const [role, rows] of Object.entries(holders)) {
    const allowed = GOLD_HOLDERS[role]
    for (const h of rows) {
      if (!(String(h.granted_to) === 'ROLE' && allowed.includes(String(h.grantee_name)))) problems.push(`${role} is held by ${String(h.granted_to).toLowerCase()} ${h.grantee_name}: only ${allowed.join(', ') || 'nobody yet'} may hold it`)
    }
    for (const a of allowed) if (!rows.some((h) => String(h.granted_to) === 'ROLE' && String(h.grantee_name) === a)) problems.push(`${a} doesn't hold ${role}`)
  }
  for (const [schema, grants] of Object.entries(schemaGrants)) {
    const readers = Object.keys(GOLD_READERS).filter((r) => schema === `${r.split('.')[0]}.GOLD`)
    for (const g of grants) {
      const privilege = String(g.privilege)
      const who = `${g.granted_to} ${g.grantee_name}`
      if (privilege === 'OWNERSHIP' && String(g.grantee_name) === 'ACCOUNTADMIN') continue
      if (String(g.grantee_name) === 'TRANSFORM_ROLE' && ['USAGE', 'CREATE TABLE', 'CREATE VIEW'].includes(privilege)) continue
      if (privilege === 'USAGE' && String(g.granted_to) === 'DATABASE_ROLE' && readers.some((r) => r.endsWith(`.${g.grantee_name}`))) continue
      problems.push(`${privilege} on schema ${schema} to ${who}: only TRANSFORM_ROLE builds gold, and only the gold readers use GOLD`)
    }
  }
  for (const [table, grants] of Object.entries(tableGrants)) {
    const db = table.split('.')[0]
    for (const g of grants) {
      const privilege = String(g.privilege)
      if (privilege === 'OWNERSHIP' && String(g.grantee_name) === 'TRANSFORM_ROLE') continue
      if (privilege === 'SELECT' && String(g.granted_to) === 'DATABASE_ROLE' && Object.keys(GOLD_READERS).includes(`${db}.${g.grantee_name}`)) continue
      problems.push(`${privilege} on ${table} to ${g.granted_to} ${g.grantee_name}: only TRANSFORM_ROLE owns and writes gold; readers only select`)
    }
  }
  return problems
}

// Who may hold each service role: its own user, nothing else.
export const SERVICE_ROLES = {
  [ROLE]: process.env.SNOWFLAKE_USERNAME,
  [LOAD_ROLE]: LOAD_USER,
  [CRM_ROLE]: CRM_USER,
  [TRANSFORM_ROLE]: TRANSFORM_USER,
}
// Holders allowed besides the service user, each with why
// (docs/decisions.md, "SYSADMIN holds ILR_APP_ROLE").
export const ROLE_HOLDER_EXCEPTIONS = {
  // The app creates and owns the 18 CAPTURE_DB.LARS tables
  // (scripts/import-lars.js); nothing else is granted on them. ACCOUNTADMIN
  // reaches them only through ACCOUNTADMIN -> SYSADMIN -> ILR_APP_ROLE: the
  // test-data scripts run as ACCOUNTADMIN join LARS.STANDARD
  // (witness_test_statements.sql, iqa_test_signoffs.sql,
  // test_learners_more.sql). Granted 27 September 2026, outside the repo.
  [ROLE]: [{ granted_to: 'ROLE', grantee_name: 'SYSADMIN' }],
}

// The problems in who holds a service role (SHOW GRANTS OF ROLE).
export function roleHolderProblems(role, holders, user = SERVICE_ROLES[role]) {
  const problems = []
  const allowed = ROLE_HOLDER_EXCEPTIONS[role] ?? []
  for (const h of holders) {
    if (allowed.some((a) => String(h.granted_to) === a.granted_to && String(h.grantee_name).toUpperCase() === a.grantee_name)) continue
    if (!(String(h.granted_to) === 'USER' && String(h.grantee_name).toUpperCase() === String(user).toUpperCase())) {
      problems.push(`${role} is held by ${String(h.granted_to).toLowerCase()} ${h.grantee_name} (granted by ${h.granted_by || 'unknown'}): only ${user} may hold it`)
    }
  }
  if (!holders.some((h) => String(h.granted_to) === 'USER' && String(h.grantee_name).toUpperCase() === String(user).toUpperCase())) problems.push(`${user} doesn't hold ${role}`)
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
    const appHolders = await execute(connection, `show grants of role ${ROLE}`)
    checked = grants.length + future.length + layers.length + appUserRoles.length + appHolders.length
    problems = grantProblems(grants, future, layers, appUserRoles)
    problems.push(...roleHolderProblems(ROLE, appHolders))
  } finally {
    await destroy(connection)
  }
  const loader = await connect({ as: 'loader' })
  try {
    const loaderGrants = await execute(loader, `show grants to role ${LOAD_ROLE}`)
    const loaderRoles = await execute(loader, `show grants to user ${LOAD_USER}`)
    const loaderHolders = await execute(loader, `show grants of role ${LOAD_ROLE}`)
    checked += loaderGrants.length + loaderRoles.length + loaderHolders.length
    problems.push(...loaderGrantProblems(loaderGrants, loaderRoles, snapshotNames))
    problems.push(...roleHolderProblems(LOAD_ROLE, loaderHolders))
  } finally {
    await destroy(loader)
  }
  const crm = await connect({ as: 'crm' })
  try {
    const crmGrants = await execute(crm, `show grants to role ${CRM_ROLE}`)
    const crmRoles = await execute(crm, `show grants to user ${CRM_USER}`)
    const crmHolders = await execute(crm, `show grants of role ${CRM_ROLE}`)
    checked += crmGrants.length + crmRoles.length + crmHolders.length
    problems.push(...crmGrantProblems(crmGrants, crmRoles))
    problems.push(...roleHolderProblems(CRM_ROLE, crmHolders))
  } finally {
    await destroy(crm)
  }
  const transform = await connect({ as: 'transform' })
  try {
    const transformGrants = await execute(transform, `show grants to role ${TRANSFORM_ROLE}`)
    const transformRoles = await execute(transform, `show grants to user ${TRANSFORM_USER}`)
    const holders = await execute(transform, `show grants of role ${TRANSFORM_ROLE}`)
    checked += transformGrants.length + transformRoles.length + holders.length
    problems.push(...transformGrantProblems(transformGrants, transformRoles, holders))
    const readerGrants = {}
    const readerHolders = {}
    for (const role of Object.keys(GOLD_READERS)) {
      readerGrants[role] = await execute(transform, `show grants to database role ${role}`)
      readerHolders[role] = await execute(transform, `show grants of database role ${role}`)
    }
    const schemaGrants = {}
    for (const schema of [...GOLD_SCHEMAS, ...GOLD_STAGING_SCHEMAS]) schemaGrants[schema] = await execute(transform, `show grants on schema ${schema}`)
    const tableGrants = {}
    for (const schema of GOLD_SCHEMAS) {
      const [db, sc] = schema.split('.')
      for (const t of await execute(transform, `select TABLE_NAME from ${db}.INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA = ?`, [sc])) {
        tableGrants[`${schema}.${t.TABLE_NAME}`] = await execute(transform, `show grants on table ${schema}.${t.TABLE_NAME}`)
      }
    }
    checked += Object.values(readerGrants).flat().length + Object.values(schemaGrants).flat().length + Object.values(tableGrants).flat().length
    problems.push(...goldProblems({ readerGrants, holders: readerHolders, schemaGrants, tableGrants }))
  } finally {
    await destroy(transform)
  }
  for (const p of problems) console.log(`FAIL ${p}`)
  console.log(problems.length
    ? `\n${problems.length} grant problem(s) for ${ROLE}, ${LOAD_ROLE}, ${CRM_ROLE} or ${TRANSFORM_ROLE}.`
    : `${checked} grants checked: ACCESS is read-only for ${ROLE}, it can't delete anything, the add-only tables stay add-only, RAW is insert-only, it owns and can create nothing in SHARED_DB, the Companies House, site, contact, vacancy, Skills England and job-run grants are in place, it can't reach the test snapshot, and it can only read OPTIONS_DB. ${LOAD_ROLE} belongs to ${LOAD_USER} alone, has nothing on ACCESS, ILR or the test snapshot, and can't delete, own or create anything. ${CRM_ROLE} belongs to ${CRM_USER} alone, can't see CAPTURE_DB (nor ${ROLE} CRM_DB), only reads shared data, keeps add-only tables add-only and its view log insert only, sets no tags and has every grant the CRM needs. ${TRANSFORM_ROLE} belongs to ${TRANSFORM_USER} alone, reads only RAW and EXT, writes only SILVER and SILVER_STAGING (and its job log), and has nothing in CAPTURE_DB, CRM_DB or ACCESS. Each service role is held by its own service user and nothing else (but SYSADMIN holding ILR_APP_ROLE, the named exception). Each gold reader reads only its own GOLD tables, and only TRANSFORM_ROLE builds gold.`)
  process.exit(problems.length ? 1 : 0)
}
