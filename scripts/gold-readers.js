// Who reads which gold tables (the gold plan of 14 October 2026;
// sql/gold_01_setup.sql). One list for both sides: each gold dbt model
// names its readers in meta.readers (check:dbt checks they match this), and
// check:grants checks Snowflake gives each reader exactly these tables.
//
// The readers are database roles, held by the products' roles:
//   SHARED_DB.GOLD_WARREN  ILR_APP_ROLE (Warren and Burrow)
//   SHARED_DB.GOLD_MEADOW  CRM_APP_ROLE (Meadow, the CRM)
//   SHARED_DB.GOLD_SITE, OPTIONS_DB.GOLD_SITE  the school leavers app (no
//                          holder yet: its build-time user comes later)
// A table listed here that hasn't been built yet is simply not checked.
export const GOLD_READERS = {
  'SHARED_DB.GOLD_WARREN': ['POSTCODE_AREA', 'VACANCY_CARD', 'JOB_OUTLOOK', 'PROVIDER_BENCHMARK'],
  'SHARED_DB.GOLD_MEADOW': ['VACANCY_CARD', 'JOB_OUTLOOK', 'AREA_PROFILE'],
  'SHARED_DB.GOLD_SITE': ['VACANCY_CARD', 'JOB_OUTLOOK', 'AREA_PROFILE'],
  'OPTIONS_DB.GOLD_SITE': ['INSTITUTION_CARD', 'INSTITUTION_RESULT', 'INSTITUTION_ACHIEVEMENT', 'NATIONAL_COMPARISON', 'UNIVERSITY_COURSE_CARD', 'UNIVERSITY_COURSE_RESULT'],
}
// Which account role may hold each reader role (none: nobody yet).
export const GOLD_HOLDERS = {
  'SHARED_DB.GOLD_WARREN': ['ILR_APP_ROLE'],
  'SHARED_DB.GOLD_MEADOW': ['CRM_APP_ROLE'],
  'SHARED_DB.GOLD_SITE': [],
  'OPTIONS_DB.GOLD_SITE': [],
}
export const GOLD_SCHEMAS = ['SHARED_DB.GOLD', 'OPTIONS_DB.GOLD']
export const GOLD_STAGING_SCHEMAS = GOLD_SCHEMAS.map((s) => `${s}_STAGING`)
