-- Travel times, phase C (fares), bus and tram: the Bus Open Data Service's
-- fares data for South Yorkshire's operators, in SHARED_DB.RAW. BODS holds
-- each operator's fares as NeTEx XML (the UK bus fares profile): fare
-- products (single, day, week and other tickets), who they are for (age
-- ranges), where they apply (lines, zones, fare tables) and the prices.
-- Open Government Licence v3.0, England, updated daily by BODS. Loaded by
-- npm run load:data (a new step, written after this file has run), as
-- DATA_LOAD_USER, logged in OPS.JOB_RUN.
--
-- Two tables, kept as published; reading the fares out of the XML is done
-- in silver (dbt), where it can be changed without more SQL here:
--
--   BODS_FARES_DATASET  one row per fares dataset BODS lists (an operator's
--                       fares, one or more NeTEx files): its id, name,
--                       operator, national operator codes (NOC, the same
--                       codes as the timetable feed's agencies), status,
--                       when it was last modified, where it is downloaded
--                       from, and the whole listing record as BODS gives it.
--   BODS_FARES_NETEX    one row per NeTEx file (or per part of one: a file
--                       whose XML is too big for one VARIANT row, 16 MB, is
--                       split into well-formed copies of the document each
--                       holding some of its frames; PART and PARTS say
--                       which). XML is the whole document as Snowflake
--                       reads it (PARSE_XML), the file itself being in the
--                       SHARED_DB.RAW.DOWNLOADS stage beside its rows, as
--                       every load's is (decision 15).
--
-- Add-only. DATA_LOAD_ROLE gets SELECT and INSERT; TRANSFORM_ROLE gets
-- SELECT (dbt reads them). Nothing else. Bronze tags (decision 21) are set
-- here; fares change often, so the refresh is quarterly at most.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The new tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.BODS_FARES_DATASET (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the BODS listing this row came from.',
  DATASET_ID    VARCHAR      NOT NULL COMMENT 'BODS''s id for the fares dataset.',
  NAME          VARCHAR      COMMENT 'The dataset''s name as the operator gave it.',
  OPERATOR_NAME VARCHAR      COMMENT 'The operator''s name as BODS gives it.',
  NOCS          VARCHAR      COMMENT 'The operator''s national operator codes, comma separated, as BODS lists them.',
  STATUS        VARCHAR      COMMENT 'BODS''s status for the dataset (published, expired, ...).',
  MODIFIED      VARCHAR      COMMENT 'When BODS last modified the dataset, as it states it.',
  URL           VARCHAR      COMMENT 'Where the dataset is downloaded from.',
  RECORD        VARIANT      NOT NULL COMMENT 'The whole listing record for the dataset, as BODS gives it.'
)
COMMENT = 'Travel times, fares. Bus Open Data Service: the bus fares datasets it lists, one row per dataset (operator, national operator codes, status, modified, download address and the whole listing record). Department for Transport. Open Government Licence v3.0. Add-only: each load adds its rows under a new SOURCEFILEID.';

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.BODS_FARES_NETEX (
  SOURCEFILEID VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the downloaded dataset (the file itself is in the stage).',
  DATASET_ID   VARCHAR      NOT NULL COMMENT 'BODS''s id for the fares dataset: matches BODS_FARES_DATASET.',
  FILE_NAME    VARCHAR      NOT NULL COMMENT 'The NeTEx XML file''s name within the dataset.',
  PART         NUMBER(38,0) NOT NULL COMMENT 'Which part of the file this row holds, from 1 (1 when the file fits one row).',
  PARTS        NUMBER(38,0) NOT NULL COMMENT 'How many parts the file was split into (1 when it fits one row).',
  XML          VARIANT      NOT NULL COMMENT 'The NeTEx document as Snowflake reads it (PARSE_XML): the UK bus fares profile.'
)
COMMENT = 'Travel times, fares. Bus Open Data Service: each operator''s bus fares as NeTEx XML (UK bus fares profile), one row per file or per part of a file too big for one row. Department for Transport. Open Government Licence v3.0. Add-only: each load adds its rows under a new SOURCEFILEID.';

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.BODS_FARES_DATASET TO ROLE DATA_LOAD_ROLE;
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.BODS_FARES_NETEX TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.BODS_FARES_DATASET TO ROLE TRANSFORM_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.BODS_FARES_NETEX TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Bronze tags (decision 21)
-- ---------------------------------------------------------------------------
ALTER TABLE SHARED_DB.RAW.BODS_FARES_DATASET SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'bods-fares', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0.', SHARED_DB.GOVERNANCE.REFRESH = 'quarterly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';
ALTER TABLE SHARED_DB.RAW.BODS_FARES_NETEX SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'bods-fares', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0.', SHARED_DB.GOVERNANCE.REFRESH = 'quarterly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new tables. Expected: 2 rows, ROW_COUNT 0, COLUMNS_ as listed:
--      SHARED_DB.RAW.BODS_FARES_DATASET 9
--      SHARED_DB.RAW.BODS_FARES_NETEX 6
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND STARTSWITH(TABLE_NAME, 'BODS_FARES_')
ORDER BY 1;

-- 2. Who has rights on them. Expected: 3 rows, each on 2 tables: INSERT
--    DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE, SELECT TRANSFORM_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND STARTSWITH(TABLE_NAME, 'BODS_FARES_') AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. Their tags. Expected: 2 rows, each: bronze, bods-fares, ogl-3,
--    quarterly, public (every table is checked afterwards by npm run
--    check:tags -- --bronze).
SELECT 'BODS_FARES_DATASET' AS TABLE_, SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.BODS_FARES_DATASET', 'table') AS LAYER,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.BODS_FARES_DATASET', 'table') AS SOURCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.BODS_FARES_DATASET', 'table') AS LICENCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.BODS_FARES_DATASET', 'table') AS REFRESH,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.BODS_FARES_DATASET', 'table') AS SENSITIVITY
UNION ALL
SELECT 'BODS_FARES_NETEX', SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.BODS_FARES_NETEX', 'table'),
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.BODS_FARES_NETEX', 'table'),
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.BODS_FARES_NETEX', 'table'),
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.BODS_FARES_NETEX', 'table'),
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.BODS_FARES_NETEX', 'table');
