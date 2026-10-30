-- The National Careers Service course directory (Department for Education):
-- the two bronze tables, their grants and their governance tags. Loaded by
-- npm run load:data -- 54 (scripts/load/ncs.js) from the monthly files on
-- https://www.gov.uk/government/publications/national-careers-service-course-directory
-- (Open Government Licence v3.0; docs/licences/ncs-course-directory-2026-10/).
--
--   OPTIONS_DB.RAW.NCS_COURSE    a live course at a venue, one row per course run
--     per venue per load (about 103,000): provider UKPRN, learning aim
--     reference, name, delivery and study mode, start date or flexible start,
--     duration, cost, region, venue name, town, county, postcode and
--     coordinates, course page, level, sector, type and awarding body.
--   OPTIONS_DB.RAW.NCS_PROVIDER  a course provider, one row per UKPRN per load
--     (about 2,300): name, trading name, town, postcode and website.
--
-- Left out before loading, so no personal data reaches Snowflake: the venues'
-- email addresses and telephone numbers and street addresses, the providers'
-- addresses, telephone numbers and email addresses, and four free-text columns
-- (who the course is for, entry requirements, how it is assessed, cost
-- description) in which providers often wrote their own phone numbers and
-- email addresses. A web address that is really an email address is blanked.
-- The download stays in RAREBIT_DATA/ncs and is never staged.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show what was made.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.NCS_COURSE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  PROVIDER_UKPRN VARCHAR,
  COURSE_ID VARCHAR,
  COURSE_RUN_ID VARCHAR,
  LEARN_AIM_REF VARCHAR,
  COURSE_NAME VARCHAR,
  DELIVER_MODE VARCHAR,
  STUDY_MODE VARCHAR,
  ATTENDANCE_PATTERN VARCHAR,
  FLEXIBLE_STARTDATE VARCHAR,
  STARTDATE VARCHAR,
  DURATION_UNIT VARCHAR,
  DURATION_VALUE VARCHAR,
  COST VARCHAR,
  NATIONAL VARCHAR,
  REGIONS VARCHAR,
  LOCATION_NAME VARCHAR,
  LOCATION_COUNTY VARCHAR,
  LOCATION_LATITUDE VARCHAR,
  LOCATION_LONGITUDE VARCHAR,
  LOCATION_POSTCODE VARCHAR,
  LOCATION_TOWN VARCHAR,
  LOCATION_WEBSITE VARCHAR,
  COURSE_URL VARCHAR,
  UPDATED_DATE VARCHAR,
  COURSE_TYPE VARCHAR,
  SECTOR VARCHAR,
  EDUCATION_LEVEL VARCHAR,
  AWARDING_BODY VARCHAR
)
COMMENT = 'National Careers Service course directory (decision 58), the live courses with regions and venues, one row per course run and venue. Department for Education. Open Government Licence v3.0. Columns named as in the file, all text. Left out before loading: venue email, telephone and address lines, and the free-text columns WHO_THIS_COURSE_IS_FOR, COST_DESCRIPTION, ENTRY_REQUIREMENTS and HOW_YOU_WILL_BE_ASSESSED (contact details of people). Codes are explained on the publication''s code tables page. Add-only: each load adds every course again.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.NCS_PROVIDER (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  PROVIDER_UKPRN VARCHAR,
  PROVIDER_NAME VARCHAR,
  TRADING_NAME VARCHAR,
  CONTACT_TOWN VARCHAR,
  CONTACT_POSTCODE VARCHAR,
  CONTACT_WEBSITE VARCHAR
)
COMMENT = 'National Careers Service course directory (decision 58), the live course providers, one row per UKPRN. Department for Education. Open Government Licence v3.0. Columns named as in the file, all text. Left out before loading: contact address lines, telephone and email. Add-only: each load adds every provider again.';

GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.NCS_COURSE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.NCS_PROVIDER TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE OPTIONS_DB.RAW.NCS_COURSE TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE OPTIONS_DB.RAW.NCS_PROVIDER TO ROLE TRANSFORM_ROLE;

ALTER TABLE OPTIONS_DB.RAW.NCS_COURSE SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'ncs-course-directory', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0.', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE OPTIONS_DB.RAW.NCS_PROVIDER SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'ncs-course-directory', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0.', SHARED_DB.GOVERNANCE.REFRESH = 'monthly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The two tables. Expected: 2 rows, ROW_COUNT 0, COLUMNS_ 30 for NCS_COURSE
--    and 8 for NCS_PROVIDER.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM OPTIONS_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('NCS_COURSE', 'NCS_PROVIDER')
ORDER BY 1;

-- 2. Who has rights on them. Expected: 3 rows: INSERT DATA_LOAD_ROLE (2 tables),
--    SELECT DATA_LOAD_ROLE (2), SELECT TRANSFORM_ROLE (2); nothing else.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('NCS_COURSE', 'NCS_PROVIDER') AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. The tags. Expected: 14 rows, 7 for each table, with the values set above.
SELECT OBJECT_NAME, TAG_NAME, TAG_VALUE
FROM TABLE(OPTIONS_DB.INFORMATION_SCHEMA.TAG_REFERENCES('OPTIONS_DB.RAW.NCS_COURSE', 'TABLE'))
UNION ALL
SELECT OBJECT_NAME, TAG_NAME, TAG_VALUE
FROM TABLE(OPTIONS_DB.INFORMATION_SCHEMA.TAG_REFERENCES('OPTIONS_DB.RAW.NCS_PROVIDER', 'TABLE'))
ORDER BY 1, 2;
