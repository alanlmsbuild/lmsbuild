-- The ONS district to county lookup (Office for National Statistics, Open
-- Geography portal): the bronze table, its grants and its governance tags.
-- Loaded by npm run load:data -- 56 (scripts/load/ons-lad-county.js) from the
-- April 2025 "Local Authority District to County and Unitary Authority Lookup
-- in the UK (V2)" (https://www.arcgis.com/home/item.html?id=3a815d3b4fa746a98390f52b1196d37d;
-- Open Government Licence v3.0, credit the Office for National Statistics;
-- docs/licences/ons-lad-county-2025-04/).
--
--   SHARED_DB.RAW.ONS_LAD_COUNTY  one row per local authority district in the
--     UK (361): its code and name, and the code and name of the county it is
--     in, or of itself where it is a unitary authority (a metropolitan,
--     London, Welsh, Scottish or Northern Irish council). Silver
--     (local_authority_county) uses it to point a district at the county
--     council whose figures cover it, where a measure is published for county
--     councils and not for districts (NEET).
--
-- Loaded as published; no personal data. The download stays in
-- RAREBIT_DATA/ons-lad-county.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice. The checks at the end show what was made.
-- NOT RUN YET (31 October 2026): the code that reads it waits on a branch.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.ONS_LAD_COUNTY (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  LAD25CD VARCHAR,
  LAD25NM VARCHAR,
  LAD25NMW VARCHAR,
  CTYUA25CD VARCHAR,
  CTYUA25NM VARCHAR,
  CTYUA25NMW VARCHAR
)
COMMENT = 'ONS Local Authority District to County and Unitary Authority (April 2025) Lookup in the UK: each local authority district with its county, or itself where it is a unitary authority. Office for National Statistics. Open Government Licence v3.0 (credit the Office for National Statistics). Columns named as in the file, all text (LAD25CD the district, CTYUA25CD its county or unitary authority). Add-only: each load adds every row again.';

GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.ONS_LAD_COUNTY TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.ONS_LAD_COUNTY TO ROLE TRANSFORM_ROLE;

ALTER TABLE SHARED_DB.RAW.ONS_LAD_COUNTY SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'ons-lad-county', SHARED_DB.GOVERNANCE.LICENCE = 'ogl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0. Source: Office for National Statistics, licensed under the Open Government Licence v3.0.', SHARED_DB.GOVERNANCE.REFRESH = 'by-hand', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The table. Expected: 1 row, ROW_COUNT 0, COLUMNS_ 8.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'ONS_LAD_COUNTY';

-- 2. Who has rights on it. Expected: 3 rows: INSERT DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE,
--    SELECT TRANSFORM_ROLE; nothing else.
SELECT PRIVILEGE_TYPE, GRANTEE
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'ONS_LAD_COUNTY' AND GRANTEE <> 'ACCOUNTADMIN'
ORDER BY 1, 2;

-- 3. The tags. Expected: 7 rows, with the values set above.
SELECT OBJECT_NAME, TAG_NAME, TAG_VALUE
FROM TABLE(SHARED_DB.INFORMATION_SCHEMA.TAG_REFERENCES('SHARED_DB.RAW.ONS_LAD_COUNTY', 'TABLE'))
ORDER BY 2;
