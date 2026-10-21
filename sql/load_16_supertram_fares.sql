-- Travel times, phase C (fares), tram: Supertram's own published fares, in
-- SHARED_DB.RAW. Supertram is not in the Bus Open Data Service (no operator
-- there publishes a Supertram fares dataset; a few bus operators' datasets
-- carry some tram tickets, which are used only to cross-check), so its fares
-- are written down by hand from Travel South Yorkshire's Supertram tickets
-- and fares pages: the ticket's name as published, who it is for, its kind,
-- the price, the page it is on and the date a person checked it there. A
-- fare with no date checked is never loaded (load:data step 49 refuses it).
-- Until it is loaded, gold bus_fare says "Tram fares: see Supertram." Fares
-- change each January, so they are re-checked by hand once a year
-- (docs/scheduling.md). Loaded by npm run load:data -- 49 from
-- scripts/fares/supertram-fares.csv (in git), as DATA_LOAD_USER, logged in
-- OPS.JOB_RUN.
--
--   SUPERTRAM_FARE  one ticket per row: "ticket", "who", "category", "price"
--                   (pounds, as published), "source_url", "date_checked"
--                   (YYYY-MM-DD) and "note".
--
-- Licence: the pages state none for their prices, which are facts about what
-- a public service charges; each row carries the page it came from. The
-- LICENCE tag value 'public-facts' (sql/load_14) is used, so nothing is added
-- to the tag. Add-only. DATA_LOAD_ROLE gets SELECT and INSERT; TRANSFORM_ROLE
-- gets SELECT. Nothing else. Bronze tags (decision 21) are set here.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;

-- ---------------------------------------------------------------------------
-- The new table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SHARED_DB.RAW.SUPERTRAM_FARE (
  SOURCEFILEID  VARCHAR(36)  NOT NULL COMMENT 'The SOURCE_FILE row of the file this row came from.',
  FILEROWNUMBER NUMBER(38,0) NOT NULL COMMENT 'Its row number in that file, as COPY counts it (METADATA$FILE_ROW_NUMBER).',
  "ticket" VARCHAR,
  "who" VARCHAR,
  "category" VARCHAR,
  "price" VARCHAR,
  "source_url" VARCHAR,
  "date_checked" VARCHAR,
  "note" VARCHAR
)
COMMENT = 'Travel times, fares. Supertram''s tickets and fares as Travel South Yorkshire publishes them on its Supertram pages, written down by hand: the ticket''s name, who it is for, its kind, the price in pounds, the page it is on and the date a person checked it there. Supertram is not in the Bus Open Data Service. Re-checked yearly (fares change each January). Columns named as in the file, all text. Add-only: each load adds its rows under a new SOURCEFILEID.';

GRANT SELECT, INSERT ON TABLE SHARED_DB.RAW.SUPERTRAM_FARE TO ROLE DATA_LOAD_ROLE;
GRANT SELECT ON TABLE SHARED_DB.RAW.SUPERTRAM_FARE TO ROLE TRANSFORM_ROLE;

ALTER TABLE SHARED_DB.RAW.SUPERTRAM_FARE SET TAG SHARED_DB.GOVERNANCE.LAYER = 'bronze', SHARED_DB.GOVERNANCE.OWNER = 'rarebit-data', SHARED_DB.GOVERNANCE.SOURCE = 'supertram-fares', SHARED_DB.GOVERNANCE.LICENCE = 'public-facts', SHARED_DB.GOVERNANCE.ATTRIBUTION = 'Fares are from Travel South Yorkshire''s Supertram pages (the page and the date checked are given on each row).', SHARED_DB.GOVERNANCE.REFRESH = 'yearly', SHARED_DB.GOVERNANCE.SENSITIVITY = 'public';

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- 1. The new table. Expected: one row, SHARED_DB.RAW.SUPERTRAM_FARE,
--    ROW_COUNT 0, COLUMNS_ 9.
SELECT TABLE_CATALOG || '.' || TABLE_SCHEMA || '.' || TABLE_NAME AS TABLE_, ROW_COUNT,
  (SELECT COUNT(*) FROM SHARED_DB.INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS COLUMNS_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLES t
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'SUPERTRAM_FARE';

-- 2. Who has rights on it. Expected: 3 rows, each on 1 table: INSERT
--    DATA_LOAD_ROLE, SELECT DATA_LOAD_ROLE, SELECT TRANSFORM_ROLE.
SELECT PRIVILEGE_TYPE, GRANTEE, COUNT(*) AS TABLES_
FROM SHARED_DB.INFORMATION_SCHEMA.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME = 'SUPERTRAM_FARE' AND GRANTEE <> 'ACCOUNTADMIN'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. Its tags. Expected: one row: bronze, supertram-fares, public-facts,
--    yearly, public (every table is checked afterwards by npm run
--    check:tags -- --bronze).
SELECT SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LAYER', 'SHARED_DB.RAW.SUPERTRAM_FARE', 'table') AS LAYER,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SOURCE', 'SHARED_DB.RAW.SUPERTRAM_FARE', 'table') AS SOURCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.LICENCE', 'SHARED_DB.RAW.SUPERTRAM_FARE', 'table') AS LICENCE,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.REFRESH', 'SHARED_DB.RAW.SUPERTRAM_FARE', 'table') AS REFRESH,
  SYSTEM$GET_TAG('SHARED_DB.GOVERNANCE.SENSITIVITY', 'SHARED_DB.RAW.SUPERTRAM_FARE', 'table') AS SENSITIVITY;
