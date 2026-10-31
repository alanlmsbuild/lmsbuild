-- The ONS Code History Database (Office for National Statistics, Register of
-- Geographic Codes): the bronze table, its grants and its governance tags.
-- Loaded by npm run load:data -- 55 (scripts/load/ons-chd.js) from the
-- Changes table of the database's CSV download
-- (https://geoportal.statistics.gov.uk/search?q=Code%20History%20Database;
-- Open Government Licence v3.0, credit the Office for National Statistics;
-- docs/licences/ons-code-history-2026-06/).
--
--   SHARED_DB.RAW.ONS_CODE_CHANGE  one row per change of a statistical
--     geography's code (about 640,000 for every kind of geography since 2009):
--     the new code and name, the code and name it replaced, the order that
--     made the change and its date. Silver keeps only the local authority rows
--     (local_authority_code_change) so that figures published under an old
--     authority code line up under today's councils.
--
-- Loaded as published, converted to UTF-8; no personal data. The download stays
-- in RAREBIT_DATA/ons-chd.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show what was made.
-- NOT RUN YET (31 October 2026): the code that reads it waits on a branch.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ONS_CODE_CHANGE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  GEOGCD VARCHAR,
  GEOGNM VARCHAR,
  GEOGNMW VARCHAR,
  GEOGCD_P VARCHAR,
  GEOGNM_P VARCHAR,
  GEOGNMW_P VARCHAR,
  SI_ID VARCHAR,
  SI_TITLE VARCHAR,
  OPER_DATE VARCHAR,
  ENTITYCD VARCHAR,
  YEAR VARCHAR
)
COMMENT = 'ONS Code History Database (Register of Geographic Codes), the Changes table: each change of a statistical geography''s code, with the order and date. Office for National Statistics. Open Government Licence v3.0 (credit the Office for National Statistics). Columns named as in the file, all text (GEOGCD new code, GEOGCD_P the code it replaced, ENTITYCD the kind of area, E06 to E09, W06, S12 and N09 are local authorities). Add-only: each load adds every row again.';

GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ONS_CODE_CHANGE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.ONS_CODE_CHANGE TO ROLE TRANSFORM_ROLE;

ALTER TABLE SHARED_DB.RAW.ONS_CODE_CHANGE SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'ons-code-history', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0. Source: Office for National Statistics, licensed under the Open Government Licence v3.0.', SHARED_DB.GOVERNANCE.REFRESH = 'by-hand', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The table. Expected: 1 row, ROW_COUNT 0, COLUMNS_ 13.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'ONS_CODE_CHANGE';

-- 2. Who has rights on it. Expected: 3 rows: INSERT DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE,
--    SELECT TRANSFORM_ROLE; nothing else.
SELECT PRIVILEGE_TYPE, GRANTEE
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'ONS_CODE_CHANGE' AND GRANTEE <> 'ACCOUNTADMIN'
ORDER BY 1, 2;

-- 3. The tags. Expected: 7 rows, with the values set above.
SELECT OBJECT_NAME, TAG_NAME, TAG_VALUE
FROM TABLE(SHARED_DB.INFORMATION_SCHEMA.TAG_REFERENCES('SHARED_DB.RAW.ONS_CODE_CHANGE', 'TABLE'))
ORDER BY 2;
