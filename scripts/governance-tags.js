// The governance tags (decision 21; sql/silver_01_setup.sql) and their
// allowed values. check:tags compares these with Snowflake's own.
export const TAG_SCHEMA = 'SHARED_DB.GOVERNANCE'
export const TAGS = ['LAYER', 'OWNER', 'SOURCE', 'LICENCE', 'ATTRIBUTION', 'REFRESH', 'SENSITIVITY']
export const ALLOWED = {
  layer: ['bronze', 'silver', 'gold'],
  owner: ['rarebit-data'],
  licence: ['ogl-3', 'cc-by-4', 'cc0', 'odbl', 'mit', 'neso-odl', 'test-data'],
  refresh: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'by-hand'],
  sensitivity: ['public', 'internal', 'personal', 'special-category', 'minor'],
}
// SOURCE: one or more SOURCE_FILE.SOURCE names, joined with commas.
export const SOURCE = /^[a-z0-9-]+(,[a-z0-9-]+)*$/
// Data that comes from an API, not a file, so has no SOURCE_FILE row: its
// SOURCE name and the RAW table that keeps every response (check:tags
// checks that table has rows).
export const API_SOURCES = {
  'faa-vacancies': 'SHARED_DB.RAW.FAA_VACANCY_PAGE',
  'skills-england': 'SHARED_DB.RAW.SE_STANDARD_VERSION',
  // Rarebit's own weekly check of the website links (decision 26).
  'website-link-check': 'SHARED_DB.EXT.WEBSITE_LINK',
  // Companies House company profiles (sql/employers_01_companies_house.sql).
  'companies-house': 'SHARED_DB.RAW.CH_COMPANY_PROFILE',
}

// Bronze (sql/load_10_ilr_dummy.sql; check:tags --bronze): the schemas the
// loaders fill. In TEST_BASELINE only the tables loaded through its
// SOURCE_FILE are bronze (it also keeps the test learner snapshot).
export const BRONZE_SCHEMAS = ['SHARED_DB.RAW', 'OPTIONS_DB.RAW', 'CAPTURE_DB.TEST_BASELINE']
// The load records: LAYER, OWNER, REFRESH and SENSITIVITY only.
export const BRONZE_RECORD_TABLES = BRONZE_SCHEMAS.map((s) => `${s}.SOURCE_FILE`)
// Bronze tables written by the app's jobs from an API, not through
// SOURCE_FILE: their SOURCE, licence (as SOURCE_FILE would word it) and the
// job in server/jobSchedule.js that fills them.
export const BRONZE_API_TABLES = {
  'SHARED_DB.RAW.FAA_VACANCY_PAGE': { source: 'faa-vacancies', licenceText: 'Open Government Licence v3.0', job: 'vacancies-new' },
  'SHARED_DB.RAW.SE_STANDARD_VERSION': { source: 'skills-england', licenceText: 'Open Government Licence v3.0', job: 'skills' },
  'SHARED_DB.RAW.SE_OCCUPATION': { source: 'skills-england', licenceText: 'Open Government Licence v3.0', job: 'skills' },
  'SHARED_DB.RAW.CH_COMPANY_PROFILE': { source: 'companies-house', licenceText: 'Open Government Licence v3.0', job: 'companies-refresh' },
}

// CRM_DB (sql/crm_02_record_view_tags.sql; check:tags --crm): the
// SENSITIVITY tags on Meadow's personal data. Exactly these: a table or
// column tagged in Snowflake but not here (or here but not tagged) fails.
// LEAD's personal columns must also be the ones the person record blanks
// for an anonymised lead (PERSONAL_LEAD_FIELDS, server/meadowPerson.js).
export const CRM_SCHEMAS = ['CRM_DB.CRM']
export const CRM_SENSITIVITY = {
  'CRM_DB.CRM.LEAD': {
    table: 'minor',
    columns: { GIVENNAMES: 'personal', FAMILYNAME: 'personal', EMAIL: 'personal', MOBILE: 'personal', DATEOFBIRTH: 'personal', POSTCODE: 'personal' },
  },
  'CRM_DB.CRM.EMAIL_MESSAGE': { columns: { TOADDRESS: 'personal' } },
  'CRM_DB.CRM.ACTIVITY': { columns: { BODY: 'personal' } },
  // sql/crm_03_contact_tags.sql
  'CRM_DB.CRM.CONTACT': { columns: { NAME: 'personal', EMAIL: 'personal', PHONE: 'personal' } },
}
