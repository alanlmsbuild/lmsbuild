-- Reach map: the colleges' own campuses. GIAS holds one record per college,
-- so each of South Yorkshire's four colleges (Barnsley College, DN Colleges
-- Group, RNN Group, The Sheffield College) is one dot at its head office.
-- This table holds each college's campuses as the college itself publishes
-- them on its own website: campus name, address and postcode as printed,
-- the page it is printed on and the date it was checked. A campus whose page
-- prints no address is kept here with an empty postcode and a note, and stays
-- off the map (the page says "Some campuses aren't shown yet"). Re-checked
-- once a year (docs/before-real-data.md). Loaded by npm run load:data -- 47
-- from scripts/reach/college-campuses.csv (in git, written by hand from the
-- pages), as DATA_LOAD_USER, logged in OPS.JOB_RUN.
--
--   COLLEGE_CAMPUS  one campus per row: "college", "college_urn" (its GIAS
--                   URN), "campus", "address" and "postcode" as printed,
--                   "source_url", "date_checked" (YYYY-MM-DD) and "note".
--
-- Licence: the college websites state none for their addresses, which are
-- facts about where a public body's premises are; each row carries the page
-- it came from. The LICENCE tag gets a new allowed value 'public-facts' for
-- that, if it isn't there yet. Add-only. DATA_LOAD_ROLE gets SELECT and
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
  SELECT ARRAY_CONTAINS('public-facts'::VARIANT, PARSE_JSON(SYSTEM$GET_TAG_ALLOWED_VALUES('SHARED_DB.GOVERNANCE.LICENCE'))) INTO :has_it;
  IF (NOT has_it) THEN
    ALTER TAG SHARED_DB.GOVERNANCE.LICENCE ADD ALLOWED_VALUES 'public-facts';
    RETURN 'public-facts added';
  END IF;
  RETURN 'public-facts already allowed';
END;
$$;

-- ---------------------------------------------------------------------------
-- The new table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.COLLEGE_CAMPUS (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "college" VARCHAR,
  "college_urn" VARCHAR,
  "campus" VARCHAR,
  "address" VARCHAR,
  "postcode" VARCHAR,
  "source_url" VARCHAR,
  "date_checked" VARCHAR,
  "note" VARCHAR
)
COMMENT = 'Reach map. The campuses of South Yorkshire''s four colleges as each college publishes them on its own website: campus name, address and postcode as printed, the page, and the date checked. GIAS has one record per college, so this is where the other campuses come from. A campus whose page prints no address has an empty postcode and a note, and is left off the map. Re-checked yearly. Columns named as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.COLLEGE_CAMPUS TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.COLLEGE_CAMPUS TO ROLE TRANSFORM_ROLE;

ALTER TABLE SHARED_DB.RAW.COLLEGE_CAMPUS SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'college-campuses', SHARED_DB.GOVERNANCE.LICENCE = 'public-facts', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Campus addresses are from each college''s own website (the page is given on each row).', SHARED_DB.GOVERNANCE.REFRESH = 'yearly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The LICENCE tag's values. Expected: one row that includes "public-facts".
SELECT SYSTEM$GET_TAG_ALLOWED_VALUES('SHARED_DB.GOVERNANCE.LICENCE') AS LICENCE_VALUES;

-- 2. The new table. Expected: one row, SHARED_DB.RAW.COLLEGE_CAMPUS,
--    ROW_COUNT 0, COLUMNS_ 10.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'COLLEGE_CAMPUS';

-- 3. Who has rights on it. Expected: 3 rows, each on 1 table: INSERT
--    DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE, SELECT TRANSFORM_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'COLLEGE_CAMPUS' AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 4. Its tags. Expected: one row: bronze, college-campuses, public-facts,
--    yearly, public (every table is checked afterwards by npm run
--    check:tags -- --bronze).
SELECT SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.COLLEGE_CAMPUS', 'table') AS LAYER,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.COLLEGE_CAMPUS', 'table') AS SOURCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.COLLEGE_CAMPUS', 'table') AS LICENCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.COLLEGE_CAMPUS', 'table') AS REFRESH,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.COLLEGE_CAMPUS', 'table') AS SENSITIVITY;
