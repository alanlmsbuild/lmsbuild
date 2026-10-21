-- Reach map: friendly area names. The House of Commons Library's names for
-- the 7,264 2021 MSOAs of England and Wales ("Crookes" for Sheffield 026),
-- version 2.3 (13 February 2026), in SHARED_DB.RAW. The reach map shows an
-- LSOA by its MSOA's name, with the ONS code in small text; the 860 South
-- Yorkshire travel LSOAs fall in 171 MSOAs, every one named (checked on 21
-- October 2026, scripts/reach/fetch-msoa-names.js). Loaded by npm run
-- load:data -- 46, as DATA_LOAD_USER, logged in OPS.JOB_RUN.
--
--   HOCL_MSOA_NAME  one MSOA per row: its code and ONS name, the Library's
--                   name (msoa21hclnm) and Welsh name, the local authority
--                   it is in, and whether it was in the 2011 names or is new
--                   in 2021 (type).
--
-- Licence: the Open Parliament Licence v3.0 (acknowledge the source and link
-- the licence), so the LICENCE tag gets a new allowed value 'opl-3' here, if
-- it isn't there yet. The original file goes into the SHARED_DB.RAW.DOWNLOADS
-- stage beside its rows, as every load's does (decision 15).
--
-- Typed table: columns named exactly as in the file's header, all text; plus
-- SOURCEFILEID and FILEROWNUMBER. Add-only. DATA_LOAD_ROLE gets SELECT and
-- INSERT; TRANSFORM_ROLE gets SELECT. Nothing else. Bronze tags (decision
-- 21) are set here.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The LICENCE tag's new value (only added if it isn't there yet)
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
  has_it BOOLEAN;
BEGIN
  SELECT ARRAY_CONTAINS('opl-3'::VARIANT, PARSE_JSON(SYSTEM$GET_TAG_ALLOWED_VALUES('SHARED_DB.GOVERNANCE.LICENCE'))) INTO :has_it;
  IF (NOT has_it) THEN
    ALTER TAG SHARED_DB.GOVERNANCE.LICENCE ADD ALLOWED_VALUES 'opl-3';
    RETURN 'opl-3 added';
  END IF;
  RETURN 'opl-3 already allowed';
END;
$$;

-- ---------------------------------------------------------------------------
-- The new table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.HOCL_MSOA_NAME (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "msoa21cd" VARCHAR,
  "msoa21nm" VARCHAR,
  "msoa21nmw" VARCHAR,
  "msoa21hclnm" VARCHAR,
  "msoa21hclnmw" VARCHAR,
  "localauthorityname" VARCHAR,
  "type" VARCHAR
)
COMMENT = 'Reach map. House of Commons Library MSOA Names, 2021 MSOAs of England and Wales (version 2.3, 13 February 2026): the Library''s everyday name for each Middle layer Super Output Area, e.g. Crookes for Sheffield 026. Open Parliament Licence v3.0: acknowledge the source and link the licence. Columns named exactly as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.HOCL_MSOA_NAME TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.HOCL_MSOA_NAME TO ROLE TRANSFORM_ROLE;

-- ---------------------------------------------------------------------------
-- Bronze tags (decision 21)
-- ---------------------------------------------------------------------------
ALTER TABLE SHARED_DB.RAW.HOCL_MSOA_NAME SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'hocl-msoa-names', SHARED_DB.GOVERNANCE.LICENCE = 'opl-3', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Contains Parliamentary information licensed under the Open Parliament Licence v3.0. MSOA Names © House of Commons Library.', SHARED_DB.GOVERNANCE.REFRESH = 'by-hand', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The LICENCE tag's values. Expected: one row that includes "opl-3".
SELECT SYSTEM$GET_TAG_ALLOWED_VALUES('SHARED_DB.GOVERNANCE.LICENCE') AS LICENCE_VALUES;

-- 2. The new table. Expected: one row, SHARED_DB.RAW.HOCL_MSOA_NAME,
--    ROW_COUNT 0, COLUMNS_ 9.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'HOCL_MSOA_NAME';

-- 3. Who has rights on it. Expected: 3 rows, each on 1 table: INSERT
--    DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE, SELECT TRANSFORM_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'HOCL_MSOA_NAME' AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 4. Its tags. Expected: one row: bronze, hocl-msoa-names, opl-3, by-hand,
--    public (every table is checked afterwards by npm run check:tags --
--    --bronze).
SELECT SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.HOCL_MSOA_NAME', 'table') AS LAYER,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.HOCL_MSOA_NAME', 'table') AS SOURCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.HOCL_MSOA_NAME', 'table') AS LICENCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.HOCL_MSOA_NAME', 'table') AS REFRESH,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.HOCL_MSOA_NAME', 'table') AS SENSITIVITY;
