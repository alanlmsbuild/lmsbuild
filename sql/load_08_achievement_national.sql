-- Loading everything, batch 7: the achievement rates provider_benchmark
-- compares like for like (decision 15; the gold plan). A provider's rate
-- and DfE's national rate for its provider type must come from the same
-- release, so all three files are from the academic year 2025/26 releases
-- (published 16 July 2026; 2022/23 to 2024/25). The apprenticeship
-- provider file of that release is already loaded (ACHIEVEMENT_APP_PROVIDER).
-- Loaded by npm run load:data step 40 (scripts/load-data.js).
--
--   OPTIONS_DB.RAW.ACHIEVEMENT_APP_NATIONAL   apprenticeships, national, by
--                                             provider type, level and age
--   OPTIONS_DB.RAW.ACHIEVEMENT_ET_NATIONAL    education and training,
--                                             national, by provider type,
--                                             provision type and age
--   OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER    education and training by
--                                             provider, the same breakdowns
--
-- The older education and training provider file (2024/25 release, in
-- ACHIEVEMENT_ET_PROVIDER_SUMMARY, which the school leavers app reads) is
-- left as it is: it has no provision type, so it gets its own table.
--
-- Typed tables: columns named exactly as in each file's header, all text;
-- plus SOURCEFILEID and FILEROWNUMBER. Add-only. DATA_LOAD_ROLE gets
-- SELECT and INSERT; TRANSFORM_ROLE gets SELECT (dbt reads them). Nothing
-- else.
--
-- Also: the publication date of the 4 Ofsted further education and skills
-- files (OPTIONS_DB.RAW.SOURCE_FILE, SOURCE ofsted-fe). Ofsted moved them to
-- a page per inspection year; that page states 10 September 2026
-- (GOV.UK content API, public_updated_at), before we downloaded them.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.ACHIEVEMENT_APP_NATIONAL (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "provider_type" VARCHAR,
  "ssa_tier_1" VARCHAR,
  "level" VARCHAR,
  "age_youth_adult" VARCHAR,
  "age_group" VARCHAR,
  "leavers" VARCHAR,
  "completers" VARCHAR,
  "achievers" VARCHAR,
  "retention_rate" VARCHAR,
  "pass_rate" VARCHAR,
  "achievement_rate" VARCHAR
)
COMMENT = 'Batch 7. Apprenticeship national achievement rates by provider type, subject area (tier 1), level and age (Apprenticeships, academic year 2025/26 release: 2022/23 to 2024/25). Department for Education. Open Government Licence v3.0. Source: na04_app_narts_provider_type_202526_14.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.ACHIEVEMENT_ET_NATIONAL (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "provision_type" VARCHAR,
  "provider_type" VARCHAR,
  "age_band" VARCHAR,
  "sector_subject_area_t1" VARCHAR,
  "regulated_qualification" VARCHAR,
  "leavers" VARCHAR,
  "completers" VARCHAR,
  "achievers" VARCHAR,
  "retention_rate" VARCHAR,
  "pass_rate" VARCHAR,
  "achievement_rate" VARCHAR
)
COMMENT = 'Batch 7. Education and training national achievement rates by provider type, provision type, regulated or not, age and subject area (tier 1) (Further education and skills, academic year 2025/26 release: 2022/23 to 2024/25). Department for Education. Open Government Licence v3.0. Source: nf03_et_narts_headline_total_202526_14.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "time_period" VARCHAR,
  "time_identifier" VARCHAR,
  "geographic_level" VARCHAR,
  "country_code" VARCHAR,
  "country_name" VARCHAR,
  "provider_name" VARCHAR,
  "provider_ukprn" VARCHAR,
  "provider_type" VARCHAR,
  "provision_type" VARCHAR,
  "regulated_qualification" VARCHAR,
  "age_band" VARCHAR,
  "sector_subject_area_t1" VARCHAR,
  "leavers" VARCHAR,
  "completers" VARCHAR,
  "achievers" VARCHAR,
  "retention_rate" VARCHAR,
  "pass_rate" VARCHAR,
  "achievement_rate" VARCHAR
)
COMMENT = 'Batch 7. Education and training achievement rates by provider (UKPRN), provision type, regulated or not, age and subject area (tier 1), with GCSEs (Further education and skills, academic year 2025/26 release: 2022/23 to 2024/25). Department for Education. Open Government Licence v3.0. Source: nf11_et_narts_provider_summary_with_gcse_202526_14.csv. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.ACHIEVEMENT_APP_NATIONAL TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.ACHIEVEMENT_ET_NATIONAL TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE OPTIONS_DB.RAW.ACHIEVEMENT_APP_NATIONAL TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE OPTIONS_DB.RAW.ACHIEVEMENT_ET_NATIONAL TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Ofsted further education and skills: publication date
-- ---------------------------------------------------------------------------
UPDATE OPTIONS_DB.RAW.SOURCE_FILE SET PUBLISHEDON = '2026-09-10'::date, PUBLISHEDONFROM = 'https://www.gov.uk/api/content/government/statistical-data-sets/further-education-and-skills-inspections-and-outcomes-management-information-from-november-2025-to-august-2026 public_updated_at'
WHERE PUBLISHEDON IS NULL AND SOURCE = 'ofsted-fe' AND SOURCEFILEID IN ('a09dcd75-1a0d-489a-8650-9eec24c558fe', '6a5503cb-61b4-46a0-81bb-30350b0c58ad', '2e46bac3-e4bb-4da3-8be4-64bc80d46782', '189bb7fe-2a8a-438d-bfe2-58aef57f6628');

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new tables. Expected: 3 rows, ROW_COUNT 0, COLUMNS_ as listed:
--      OPTIONS_DB.RAW.ACHIEVEMENT_APP_NATIONAL 18
--      OPTIONS_DB.RAW.ACHIEVEMENT_ET_NATIONAL 18
--      OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER 20
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM OPTIONS_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLES t WHERE TABLE_SCHEMA = 'RAW' AND COMMENT LIKE 'Batch 7.%'
ORDER BY 1;

-- 2. Who has rights on them. Expected: 3 rows, each on 3 tables:
--    INSERT DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE, SELECT TRANSFORM_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM OPTIONS_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME IN ('ACHIEVEMENT_APP_NATIONAL', 'ACHIEVEMENT_ET_NATIONAL', 'ACHIEVEMENT_ET_PROVIDER')
  AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. The Ofsted further education and skills files. Expected: 4 rows, each
--    PUBLISHEDON 2026-09-10 and PUBLISHEDONFROM the GOV.UK content API page.
SELECT TARGETTABLE, PUBLISHEDON, PUBLISHEDONFROM
FROM OPTIONS_DB.RAW.SOURCE_FILE WHERE SOURCE = 'ofsted-fe' ORDER BY 1;
